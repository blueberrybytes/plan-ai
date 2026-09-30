const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 27 refuses any target below iOS 15. Some pods (GoogleSignIn,
// GTMSessionFetcher, SDWebImage, the Google privacy bundles) still declare
// 9.0 or 12.0, so EAS builds on the "latest" image failed. Every pod target
// is raised to the app's own minimum.
const MIN_IOS = '15.1';
const MARKER = '# Raise pods to the minimum iOS the current Xcode accepts';

function addMinDeploymentTarget(contents) {
  if (contents.includes(MARKER)) return contents;
  const fix = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |build_config|
      current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN_IOS}')
        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'
      end
    end
  end
`;
  const hook = /post_install do \|installer\|\n/;
  if (!hook.test(contents)) {
    throw new Error('with-min-pod-deployment-target: no post_install block in the Podfile');
  }
  return contents.replace(hook, (match) => `${match}${fix}`);
}

module.exports = function withMinPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(file)) return config;
      const contents = fs.readFileSync(file, 'utf-8');
      fs.writeFileSync(file, addMinDeploymentTarget(contents));
      return config;
    },
  ]);
};

module.exports.addMinDeploymentTarget = addMinDeploymentTarget;
