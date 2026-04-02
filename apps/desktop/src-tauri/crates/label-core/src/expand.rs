use std::collections::HashMap;

pub fn expand_text(input: &str, vars: &HashMap<String, String>) -> String {
    vars.iter().fold(input.to_string(), |acc, (key, value)| {
        acc.replace(&format!("${{{}}}", key), value)
    })
}
