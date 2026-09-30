//! What the stores share for their columns of words: an enum kept as its kebab-case text, and the read of one.

use rusqlite::Row;

/// An enum that is a word in a column: kebab-case for serde and for SQL, with `as_str` and `parse` between them.
macro_rules! text_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident = $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
        #[serde(rename_all = "kebab-case")]
        pub enum $name { $($variant),+ }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }

            pub(crate) fn parse(text: &str) -> Option<Self> {
                match text { $($text => Some(Self::$variant),)+ _ => None }
            }
        }
    };
}
pub(crate) use text_enum;

/// A column of words as its enum; a word the enum does not know is a conversion failure, not a silent default.
pub(crate) fn text_column<T>(
    row: &Row<'_>,
    index: usize,
    parse: fn(&str) -> Option<T>,
) -> rusqlite::Result<T> {
    let text: String = row.get(index)?;
    parse(&text).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            format!("not a value of the column: {text:?}").into(),
        )
    })
}
