# Cynthia Phone Hand status

The autonomous-builder branch adds `scripts/phone-to-github.sh`.

The script:
- accepts a ZIP or folder from Android storage;
- explicitly extracts ZIP inputs first;
- preserves the original input;
- excludes obvious secrets from the temporary upload copy;
- creates and pushes a new private GitHub repository;
- if present on the phone, seeds the uploaded `github-app-automaton-FIXED-v2.1.0.zip` and `synthia-field-scanner.yml` into the new repository before the first push;
- preserves an existing project Automaton folder rather than replacing it.

Default seed locations:
- `/sdcard/Download/github-app-automaton-FIXED-v2.1.0.zip`
- `/sdcard/Download/synthia-field-scanner.yml`

Both can be overridden with `SYNTHIA_AUTOMATON_ZIP` and `SYNTHIA_FIELD_SCANNER`.
