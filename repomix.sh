#!/bin/bash

# Ensure output directory exists
mkdir -p repomix_output

IGNORE_PATTERN="**/tests/**,**/*.test.*,**/*.spec.*,**/android/**,**/ios/**,**/.next/**,**/dist/**,**/build/**,**/.expo/**,**/coverage/**,**/jest/**,**/__tests__/**,**/*.pbxproj,**/*.xcworkspacedata,**/*.storyboard"

echo "Packing plan-ai/backend..."
npx repomix plan-ai/backend --output repomix_output/backend.xml --style xml --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai/frontend..."
npx repomix plan-ai/frontend --output repomix_output/frontend.xml --style xml --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai-mobile..."
npx repomix plan-ai-mobile --output repomix_output/mobile.xml --style xml --ignore "$IGNORE_PATTERN"

echo "Packing plan-ai-recorder..."
npx repomix plan-ai-recorder --output repomix_output/recorder.xml --style xml --ignore "$IGNORE_PATTERN"

echo "Done! XML files generated in repomix_output/"
