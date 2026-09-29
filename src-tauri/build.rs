fn main() {
    // The channel a binary was built for is read at compile time (`option_env!("EDEN_ENV")` in commands/app.rs), so a
    // change of EDEN_ENV between `yarn dev` and `yarn build:staging` must rebuild the crate.
    println!("cargo:rerun-if-env-changed=EDEN_ENV");
    tauri_build::build()
}
