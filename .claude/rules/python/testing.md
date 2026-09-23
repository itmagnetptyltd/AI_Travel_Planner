# Python — testing

- Every acceptance criterion gets a test annotated `# @covers REQ-…@vN`.
- Tests live under `tests/` or as `test_*.py`. They are not the product.
- Belt **A** is those unit files. Belt **B** is `e2e/` / `tests/e2e/`. Belt **C**
  is `tests/api/` or `*_http_test.py`.
- A test that cannot fail is not a test.
