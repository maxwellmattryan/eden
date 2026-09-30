//! The hybrid logical clock that stamps every row.
//!
//! A stamp is `{wall_ms:016x}-{counter:08x}-{node:08x}`: fixed-width lowercase hex, so comparing two stamps as text
//! compares them as `(wall_ms, counter, node)`. The wall part is milliseconds since the Unix epoch, which is where a
//! row's human times come from; the counter orders what happens within one millisecond, or while the wall clock runs
//! behind the last stamp; the node tells two devices apart.
//!
//! The clock lives in `meta` and is only ever ticked inside a write, where the writer's mutex makes read, tick and
//! persist one step.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension};

use crate::error::{EdenError, Result};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Hlc {
    pub wall_ms: u64,
    pub counter: u32,
    pub node: u32,
}

impl Hlc {
    /// Advances for a local write against the wall clock.
    pub fn tick(&mut self, now_ms: u64) {
        if now_ms > self.wall_ms {
            self.wall_ms = now_ms;
            self.counter = 0;
        } else {
            self.counter = self.counter.saturating_add(1);
        }
    }

    /// Advances past a stamp from elsewhere: the clock ends later than both, whatever the wall clock says.
    pub fn receive(&mut self, remote: &Hlc, now_ms: u64) {
        let wall_ms = self.wall_ms.max(remote.wall_ms).max(now_ms);
        self.counter = if wall_ms == self.wall_ms && wall_ms == remote.wall_ms {
            self.counter.max(remote.counter).saturating_add(1)
        } else if wall_ms == self.wall_ms {
            self.counter.saturating_add(1)
        } else if wall_ms == remote.wall_ms {
            remote.counter.saturating_add(1)
        } else {
            0
        };
        self.wall_ms = wall_ms;
    }

    pub fn format(&self) -> String {
        format!(
            "{:016x}-{:08x}-{:08x}",
            self.wall_ms, self.counter, self.node
        )
    }

    pub fn parse(stamp: &str) -> Result<Hlc> {
        let bad = || EdenError::InvalidOperation(format!("not a stamp: {stamp:?}"));
        let parts: Vec<&str> = stamp.split('-').collect();
        let [wall, counter, node] = parts.as_slice() else {
            return Err(bad());
        };
        if wall.len() != 16 || counter.len() != 8 || node.len() != 8 {
            return Err(bad());
        }
        Ok(Hlc {
            wall_ms: u64::from_str_radix(wall, 16).map_err(|_| bad())?,
            counter: u32::from_str_radix(counter, 16).map_err(|_| bad())?,
            node: u32::from_str_radix(node, 16).map_err(|_| bad())?,
        })
    }
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The next stamp of this device. Call it once per logical write, inside the write.
pub fn next(conn: &Connection) -> Result<String> {
    next_at(conn, now_ms())
}

/// Takes in a stamp that came from elsewhere, so that every stamp made after it is later. What an import does with
/// the latest stamp of its bundle.
pub fn receive(conn: &Connection, remote: &str) -> Result<()> {
    let mut clock = load(conn)?;
    clock.receive(&Hlc::parse(remote)?, now_ms());
    persist(conn, &clock)
}

fn persist(conn: &Connection, clock: &Hlc) -> Result<()> {
    write_meta(conn, "hlc_wall_ms", &clock.wall_ms.to_string())?;
    write_meta(conn, "hlc_counter", &clock.counter.to_string())
}

fn next_at(conn: &Connection, now_ms: u64) -> Result<String> {
    let mut clock = load(conn)?;
    clock.tick(now_ms);
    persist(conn, &clock)?;
    Ok(clock.format())
}

fn load(conn: &Connection) -> Result<Hlc> {
    Ok(Hlc {
        wall_ms: read_meta(conn, "hlc_wall_ms")?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        counter: read_meta(conn, "hlc_counter")?
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        node: node_id(conn)?,
    })
}

/// This device's node id, generated on the first write and kept as 8 hex characters.
pub(crate) fn node_id(conn: &Connection) -> Result<u32> {
    if let Some(stored) = read_meta(conn, "node_id")? {
        return u32::from_str_radix(stored.trim(), 16)
            .map_err(|e| EdenError::InvalidOperation(format!("invalid node id {stored:?}: {e}")));
    }
    // The low 32 bits of a v4 UUID; `| 1` keeps it from being zero, the node of the seeded rows.
    let node = (uuid::Uuid::new_v4().as_u128() as u32) | 1;
    write_meta(conn, "node_id", &format!("{node:08x}"))?;
    Ok(node)
}

pub(crate) fn read_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?)
}

pub(crate) fn write_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::testing::memory;

    fn hlc(wall_ms: u64, counter: u32, node: u32) -> Hlc {
        Hlc {
            wall_ms,
            counter,
            node,
        }
    }

    // The same vectors as `packages/shared/src/data/hlc.test.ts`: the two implementations must agree.
    #[test]
    fn a_stamp_formats_and_parses() {
        let stamp = hlc(1_790_000_000_000, 3, 0xab).format();
        assert_eq!(stamp, "000001a0c4506c00-00000003-000000ab");
        assert_eq!(Hlc::parse(&stamp).unwrap(), hlc(1_790_000_000_000, 3, 0xab));
        for bad in [
            "",
            "1-2-3",
            "000001a0c4506c00-00000003",
            "zzzzzzzzzzzzzzzz-00000003-000000ab",
        ] {
            assert!(Hlc::parse(bad).is_err(), "{bad:?} should not parse");
        }
    }

    #[test]
    fn text_order_is_clock_order() {
        let stamps = [
            hlc(1000, 0, 9).format(),
            hlc(1000, 1, 1).format(),
            hlc(1001, 0, 1).format(),
            hlc(1 << 40, 0, 1).format(),
        ];
        assert!(stamps.windows(2).all(|pair| pair[0] < pair[1]));
    }

    #[test]
    fn a_tick_follows_the_wall_clock_and_counts_when_it_stalls() {
        let mut clock = hlc(0, 0, 1);
        clock.tick(1000);
        assert_eq!((clock.wall_ms, clock.counter), (1000, 0));
        clock.tick(1000);
        assert_eq!((clock.wall_ms, clock.counter), (1000, 1));
        // The wall clock went backwards: the stamp still moves forward.
        clock.tick(900);
        assert_eq!((clock.wall_ms, clock.counter), (1000, 2));
        clock.tick(2000);
        assert_eq!((clock.wall_ms, clock.counter), (2000, 0));
    }

    #[test]
    fn a_receive_ends_later_than_both_in_every_case() {
        let cases = [
            // the same wall on both sides, the wall clock behind
            (hlc(1000, 5, 1), hlc(1000, 9, 2), 900, hlc(1000, 10, 1)),
            // the local clock ahead
            (hlc(2000, 5, 1), hlc(1000, 9, 2), 900, hlc(2000, 6, 1)),
            // the remote clock ahead
            (hlc(1000, 5, 1), hlc(3000, 9, 2), 900, hlc(3000, 10, 1)),
            // the wall clock ahead of both
            (hlc(1000, 5, 1), hlc(3000, 9, 2), 4000, hlc(4000, 0, 1)),
        ];
        for (mut local, remote, now, expected) in cases {
            local.receive(&remote, now);
            assert_eq!(local, expected);
        }
    }

    #[test]
    fn a_stamp_taken_in_is_earlier_than_the_next_one_made() {
        let conn = memory();
        let far = hlc(u64::MAX / 2, 7, 3).format();
        receive(&conn, &far).unwrap();
        assert!(next(&conn).unwrap() > far);
        assert!(receive(&conn, "not a stamp").is_err());
    }

    #[test]
    fn the_clock_persists_and_keeps_one_node() {
        let conn = memory();
        let first = next_at(&conn, 5000).unwrap();
        let second = next_at(&conn, 5000).unwrap();
        let third = next_at(&conn, 4000).unwrap();
        assert!(first < second && second < third);

        let node = Hlc::parse(&first).unwrap().node;
        assert_ne!(node, 0);
        assert_eq!(Hlc::parse(&third).unwrap().node, node);
        assert_eq!(Hlc::parse(&third).unwrap(), hlc(5000, 2, node));
    }
}
