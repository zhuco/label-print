use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueueState {
    Idle,
    Running,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Error)]
pub enum QueueError {
    #[error("invalid transition from {from:?} to {to:?}")]
    InvalidTransition { from: QueueState, to: QueueState },
}

#[derive(Debug)]
pub struct PrintQueue {
    state: QueueState,
}

impl PrintQueue {
    pub fn new() -> Self {
        Self { state: QueueState::Idle }
    }

    pub fn state(&self) -> QueueState {
        self.state
    }

    pub fn start(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Running, &[QueueState::Idle])
    }

    pub fn pause(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Paused, &[QueueState::Running])
    }

    pub fn resume(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Running, &[QueueState::Paused])
    }

    pub fn complete(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Completed, &[QueueState::Running, QueueState::Paused])
    }

    pub fn fail(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Failed, &[QueueState::Running, QueueState::Paused])
    }

    pub fn cancel(&mut self) -> Result<(), QueueError> {
        self.transition(QueueState::Idle, &[QueueState::Running, QueueState::Paused])
    }

    fn transition(&mut self, to: QueueState, allowed_from: &[QueueState]) -> Result<(), QueueError> {
        if allowed_from.contains(&self.state) {
            self.state = to;
            Ok(())
        } else {
            Err(QueueError::InvalidTransition {
                from: self.state,
                to,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PrintQueue, QueueState};

    #[test]
    fn pause_only_allowed_from_running() {
        let mut q = PrintQueue::new();
        assert!(q.pause().is_err());

        q.start().expect("start should succeed");
        assert!(q.pause().is_ok());
        assert_eq!(q.state(), QueueState::Paused);
    }

    #[test]
    fn resume_only_allowed_from_paused() {
        let mut q = PrintQueue::new();
        q.start().expect("start should succeed");
        q.pause().expect("pause should succeed");

        assert!(q.resume().is_ok());
        assert_eq!(q.state(), QueueState::Running);
    }

    #[test]
    fn complete_from_running_or_paused() {
        let mut running = PrintQueue::new();
        running.start().expect("start should succeed");
        running.complete().expect("complete should succeed");
        assert_eq!(running.state(), QueueState::Completed);

        let mut paused = PrintQueue::new();
        paused.start().expect("start should succeed");
        paused.pause().expect("pause should succeed");
        paused.complete().expect("complete should succeed");
        assert_eq!(paused.state(), QueueState::Completed);
    }
}
