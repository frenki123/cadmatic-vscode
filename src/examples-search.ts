import * as path from 'path';

export type ExamplesDirResult =
    | { ok: true; examplesDir: string }
    | { ok: false; error: string };

export function deriveExamplesDirFromInstallDir(installDir: string): ExamplesDirResult {
    const trimmedInstallDir = installDir.trim();
    if (!trimmedInstallDir) {
        return {
            ok: false,
            error: 'Install directory is required to derive examples directory.'
        };
    }

    const normalizedInstallDir = path.normalize(trimmedInstallDir);
    const installDirName = path.basename(normalizedInstallDir);
    const coMatch = /^co(\d{3})$/.exec(installDirName);
    if (!coMatch) {
        return {
            ok: false,
            error: 'Install directory must end with co<3 digits>, for example: co252.'
        };
    }

    const coDigits = coMatch[1];
    const examplesDirName = `pms${coDigits}0`;
    return {
        ok: true,
        examplesDir: path.join(normalizedInstallDir, examplesDirName)
    };
}
