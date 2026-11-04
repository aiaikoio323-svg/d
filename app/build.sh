#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/z/my-project/scripts/android
BT=/home/z/my-project/tools/android/bt/android-14
PLAT=/home/z/my-project/tools/android/pf/android-34/android.jar
ECJ=/home/z/my-project/tools/android/dl/ecj.jar
OUT=$ROOT/build
KS=$ROOT/aipulse.keystore
KS_PASS="AIPulse2025!key"

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex" "$OUT/gen"

echo "[1/6] aapt2 compile resources..."
"$BT/aapt2" compile --dir "$ROOT/res" -o "$OUT/res.zip"

echo "[2/6] aapt2 link..."
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLAT" \
  --manifest "$ROOT/AndroidManifest.xml" \
  -R "$OUT/res.zip" \
  -A "$ROOT/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 13 --version-name 4.0 \
  --auto-add-overlay

echo "[3/6] compile java (ECJ)..."
java -jar "$ECJ" -encoding UTF-8 -source 8 -target 8 -nowarn \
  -bootclasspath "$PLAT" -cp "$PLAT:$BT/core-lambda-stubs.jar" -d "$OUT/classes" \
  "$OUT/gen/com/aipulse/news/R.java" \
  "$ROOT/java/com/aipulse/news/MainActivity.java"

echo "[4/6] dex (d8)..."
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --lib "$PLAT" --min-api 24 \
  --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j "$OUT/unsigned.apk" classes.dex)

echo "[5/6] zipalign..."
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "[6/6] sign..."
java -jar "$BT/lib/apksigner.jar" sign \
  --ks "$KS" --ks-key-alias aipulse \
  --ks-pass pass:"$KS_PASS" --key-pass pass:"$KS_PASS" \
  --out "$OUT/aipulse.apk" "$OUT/aligned.apk"

java -jar "$BT/lib/apksigner.jar" verify --print-certs "$OUT/aipulse.apk"
echo "DONE: $OUT/aipulse.apk"
du -h "$OUT/aipulse.apk"
