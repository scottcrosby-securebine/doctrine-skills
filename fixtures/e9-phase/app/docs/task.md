# Task: implement slugify

`slugify(text)` in `src/slug.mjs` returns a URL slug:

- Remove accents first, so `é` becomes `e`.
- Then lowercase.
- A letter is `a` to `z` and a digit is `0` to `9`. Every other character, including a letter with no unaccented form such as `ø` or `ß`, is a separator.
- Every run of separators becomes one hyphen, and no hyphen stays at either end.

The cases in `test.mjs` are the acceptance test and are not to be changed.
