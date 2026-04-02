pub mod expand;
pub mod layout;
pub mod queue;
pub mod template;

#[cfg(test)]
mod tests {
    use maplit::hashmap;

    use crate::expand::expand_text;
    use crate::layout::{validate_bounds, ElementBounds, LabelSize};

    #[test]
    fn expands_template_variables() {
        let text = expand_text("SKU:${sku}", &hashmap! {"sku".to_string() => "A001".to_string()});
        assert_eq!(text, "SKU:A001");
    }

    #[test]
    fn rejects_out_of_bounds_elements() {
        let size = LabelSize { width_mm: 30.0, height_mm: 20.0 };
        let element = ElementBounds { x_mm: 25.0, y_mm: 5.0, width_mm: 10.0, height_mm: 10.0 };

        let result = validate_bounds(size, element);

        assert!(result.is_err());
    }
}
