#!/usr/bin/env bash
set -euo pipefail

# GitHub's official Ubuntu runner image ships Chrome. Use that installation
# rather than blocking acceptance on another apt/CDN download; record its version.
# https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-google-chrome.sh
if [[ "${GITHUB_ACTIONS:-}" == "true" && -x /usr/bin/google-chrome ]]; then
  /usr/bin/google-chrome --version
  printf '%s\n' 'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome' >> "${GITHUB_ENV:?GitHub environment file is required}"
else
  # Other runners retain Playwright's pinned browser, with a bounded install.
  timeout 180s npx playwright install --with-deps chromium
fi
