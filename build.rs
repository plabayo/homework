#![allow(clippy::unwrap_used, reason = "build scripts are expected to panic on configuration errors")]

use vergen_gitcl::{Emitter, GitclBuilder};

fn main() {
    let git = GitclBuilder::default().sha(true).build().unwrap();

    Emitter::new()
        .add_instructions(&git)
        .unwrap()
        .emit()
        .unwrap();
}
