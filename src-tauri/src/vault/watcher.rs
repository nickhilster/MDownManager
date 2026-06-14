use anyhow::Result;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
    pub rx: mpsc::Receiver<WatchEvent>,
}

#[derive(Debug)]
pub enum WatchEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
}

impl VaultWatcher {
    pub fn new(path: PathBuf) -> Result<Self> {
        let (tx, rx) = mpsc::channel();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            let Ok(event) = res else { return };
            let paths: Vec<PathBuf> = event
                .paths
                .into_iter()
                .filter(|p| p.extension().map(|e| e == "md").unwrap_or(false))
                .collect();

            for path in paths {
                let ev = match event.kind {
                    EventKind::Create(_) => WatchEvent::Created(path),
                    EventKind::Modify(_) => WatchEvent::Modified(path),
                    EventKind::Remove(_) => WatchEvent::Removed(path),
                    _ => continue,
                };
                let _ = tx.send(ev);
            }
        })?;

        watcher.watch(&path, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    pub fn poll(&self) -> Vec<WatchEvent> {
        let mut events = Vec::new();
        while let Ok(ev) = self.rx.recv_timeout(Duration::from_millis(0)) {
            events.push(ev);
        }
        events
    }
}
