#!/bin/bash

# Ensure output directory exists
mkdir -p repomix_output

IGNORE_PATTERN="**/tests/**,**/*.test.*,**/*.spec.*,**/android/**,**/ios/**,**/.next/**,**/dist/**,**/build/**,**/.expo/**,**/coverage/**,**/jest/**,**/__tests__/**,**/*.pbxproj,**/*.xcworkspacedata,**/*.storyboard"

echo "Packing plan-ai/backend (Markdown)..."
npx repomix plan-ai/backend --output repomix_output/backend.md --style markdown --compress --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai/frontend (Markdown)..."
npx repomix plan-ai/frontend --output repomix_output/frontend.md --style markdown --compress --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai-mobile (Markdown)..."
npx repomix plan-ai-mobile --output repomix_output/mobile.md --style markdown --compress --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai-recorder (Markdown)..."
npx repomix plan-ai-recorder --output repomix_output/recorder.md --style markdown --compress --ignore "$IGNORE_PATTERN"

echo "Done! Markdown files generated in repomix_output/"
