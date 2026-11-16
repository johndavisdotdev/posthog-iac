import { awscdk, javascript } from 'projen';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'John Davis',
  authorAddress: 'john@johndavis.dev',
  cdkVersion: '2.277.0',
  defaultReleaseBranch: 'main',
  description: 'AWS CDK constructs for PostHog, built on the PostHog::* CloudFormation resource types',
  github: false,
  jsiiVersion: '~6.0.0',
  name: '@posthog/cdk-constructs',
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  repositoryUrl: 'https://github.com/johndavisdev/posthog-iac.git',
  repositoryDirectory: 'constructs',
  keywords: ['posthog', 'cdk', 'aws-cdk', 'cloudformation', 'analytics', 'feature-flags'],
  license: 'Apache-2.0',

  devDeps: ['cdk-import@0.2.1055'],
  gitignore: ['/cdk.out', '*.tsbuildinfo'],
  eslintOptions: {
    dirs: ['src'],
    devdirs: ['test', 'projenrc'],
    ignorePatterns: ['*.generated.ts'],
  },
  jestOptions: {
    jestConfig: {
      coveragePathIgnorePatterns: ['/node_modules/', '\\.generated\\.ts$'],
    },
  },
});

// L1 constructs are generated from the resource type schemas in ../posthog-*/.
project.addTask('generate:l1', {
  description: 'Regenerate the L1 (Cfn*) constructs from the PostHog::* resource schemas',
  exec: 'ts-node --project projenrc/tsconfig.json projenrc/generate-l1.ts',
});

project.synth();
