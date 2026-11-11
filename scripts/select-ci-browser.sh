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

# The stock runner can launch Chrome without a Traditional Chinese font.
# Supply a checksum-verified, revision-pinned OFL font for faithful screenshots.
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  task_font_dir="${HOME}/.local/share/fonts/smartvolt-ci"
  mkdir -p "$task_font_dir"
  curl --fail --location --retry 1 --connect-timeout 10 --max-time 60 \
    'https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf' \
    --output "$task_font_dir/NotoSansCJKtc-Regular.otf"
  printf '%s  %s\n' 'dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4' "$task_font_dir/NotoSansCJKtc-Regular.otf" | sha256sum --check
  fc-cache --force "$task_font_dir"
  fc-match ':lang=zh-tw'
fi
