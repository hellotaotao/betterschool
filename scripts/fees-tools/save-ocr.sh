#!/bin/sh
# OCR an image-only fee table into a school's raw folder as a cross-check for
# figures read off the image by eye. The log URL gets "#ocr": readRawPages
# drops repeated URLs, and the PDF itself is often already logged under the
# plain one. Prints the dollar amounts OCR found, to compare with the reading.
#
#   sh scripts/fees-tools/save-ocr.sh <acara_sml_id> <source-url> <image.png>
set -e
id=$1; url=$2; png=$3
dir=data/fees/raw/$id; mkdir -p "$dir"
file=ocr-$(printf '%s' "$url" | shasum | cut -c1-6)
{ echo "URL: $url"; echo "LINK: fee table image (local OCR, cross-check only)"; echo; tesseract "$png" - 2>/dev/null; } > "$dir/$file.txt"
node -e '
const fs = require("fs");
const [dir, file, url] = process.argv.slice(1);
const p = dir + "/_log.json";
const log = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : [];
if (!log.some(e => e.file === file)) log.push({ url: url + "#ocr", link: "fee table image (local OCR, cross-check only)", file, pdf: false });
fs.writeFileSync(p, JSON.stringify(log, null, 1));
' "$dir" "$file" "$url"
grep -o '\$ \?[0-9][0-9,.]*' "$dir/$file.txt" | tr '\n' ' '; echo
