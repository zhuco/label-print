use thiserror::Error;

#[derive(Debug, Clone, Copy)]
pub struct LabelSize {
    pub width_mm: f32,
    pub height_mm: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct ElementBounds {
    pub x_mm: f32,
    pub y_mm: f32,
    pub width_mm: f32,
    pub height_mm: f32,
}

#[derive(Debug, Error)]
pub enum LayoutError {
    #[error("element bounds exceed label size")]
    OutOfBounds,
}

pub fn validate_bounds(size: LabelSize, element: ElementBounds) -> Result<(), LayoutError> {
    let within_x = element.x_mm >= 0.0 && element.x_mm + element.width_mm <= size.width_mm;
    let within_y = element.y_mm >= 0.0 && element.y_mm + element.height_mm <= size.height_mm;

    if within_x && within_y {
        Ok(())
    } else {
        Err(LayoutError::OutOfBounds)
    }
}
