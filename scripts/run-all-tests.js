import { spawn } from 'node:child_process';

const forwardedArgs = process.argv.slice(2);

async function runNpmScript(scriptName) {
  console.log(`[tests] running ${scriptName}`);

  return await new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(
            'cmd.exe',
            [
              '/d',
              '/s',
              '/c',
              `npm run ${scriptName} -- ${forwardedArgs.join(' ')}`.trim(),
            ],
            {
              stdio: 'inherit',
              shell: false,
            }
          )
        : spawn('npm', ['run', scriptName, '--', ...forwardedArgs], {
            stdio: 'inherit',
            shell: false,
          });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

const unitExitCode = await runNpmScript('test:unit');
const jsdomExitCode = await runNpmScript('test:jsdom');
const browserExitCode = await runNpmScript('test:browser');
const a11yExitCode = await runNpmScript('test:a11y');

if (
  unitExitCode !== 0 ||
  jsdomExitCode !== 0 ||
  browserExitCode !== 0 ||
  a11yExitCode !== 0
) {
  process.exit(1);
}
