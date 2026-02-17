# pigeon

## Pre-push Checklist

Before pushing Rust changes, always run the following from `server/`:

```bash
cargo fmt
cargo clippy -- -D warnings
cargo test
```

Do not push until all three pass.
