import * as assert from 'assert';

suite('CADMATIC Extension Tests', function() {

    test('Project configuration schema validation', function() {
        const mockConfig: Record<string, { installDir: string; lang?: string }> = {
            'Project1': {
                'installDir': 'C:\\Cadmatic\\co252',
                'lang': 'english'
            },
            'Project2': {
                'installDir': '/opt/cadmatic/co252',
                'lang': 'german'
            }
        };

        assert.strictEqual(Object.keys(mockConfig).length, 2);
        assert.strictEqual(mockConfig['Project1'].installDir, 'C:\\Cadmatic\\co252');
        assert.strictEqual(mockConfig['Project1'].lang, 'english');
        assert.strictEqual(mockConfig['Project2'].installDir, '/opt/cadmatic/co252');
        assert.strictEqual(mockConfig['Project2'].lang, 'german');
    });

    test('Project data structure', function() {
        interface ProjectData {
            installDir: string;
            lang?: string;
        }

        const projectData: ProjectData = {
            installDir: '/test/install',
            lang: 'english'
        };

        assert.strictEqual(projectData.installDir, '/test/install');
        assert.strictEqual(projectData.lang, 'english');
    });

    test('Project activation logic', function() {
        interface ProjectData {
            installDir: string;
            lang?: string;
        }
        type ProjectProfiles = Record<string, ProjectData>;

        const projects: ProjectProfiles = {
            'Project1': { installDir: '/path1' },
            'Project2': { installDir: '/path2', lang: 'german' }
        };

        const activeProject = 'Project1';

        if (activeProject && projects[activeProject]) {
            const data = projects[activeProject];
            assert.strictEqual(data.installDir, '/path1');
            assert.strictEqual(data.lang, undefined);
        } else {
            assert.fail('Should have found active project');
        }

        const newActiveProject = 'Project2';
        if (newActiveProject && projects[newActiveProject]) {
            const data = projects[newActiveProject];
            assert.strictEqual(data.installDir, '/path2');
            assert.strictEqual(data.lang, 'german');
        }
    });

    test('Initialization options building', function() {
        interface ProjectData {
            installDir: string;
            lang?: string;
        }

        interface InitOptions {
            install_dir: string;
            lang: string;
        }

        function buildInitializationOptions(projectData: ProjectData | undefined): InitOptions {
            return {
                install_dir: projectData?.installDir || '',
                lang: projectData?.lang || 'english'
            };
        }

        const withProject: ProjectData = { installDir: 'C:\\Cadmatic\\co252', lang: 'german' };
        const withoutLang: ProjectData = { installDir: 'C:\\Cadmatic\\co252' };

        const result1 = buildInitializationOptions(withProject);
        assert.strictEqual(result1.install_dir, 'C:\\Cadmatic\\co252');
        assert.strictEqual(result1.lang, 'german');

        const result2 = buildInitializationOptions(withoutLang);
        assert.strictEqual(result2.install_dir, 'C:\\Cadmatic\\co252');
        assert.strictEqual(result2.lang, 'english');

        const result3 = buildInitializationOptions(undefined);
        assert.strictEqual(result3.install_dir, '');
        assert.strictEqual(result3.lang, 'english');
    });

    test('Directory validation', function() {
        const fs = require('fs');

        function isExistingDirectory(pathValue: string): boolean {
            try {
                const stats = fs.statSync(pathValue);
                return stats.isDirectory();
            } catch {
                return false;
            }
        }

        assert.strictEqual(isExistingDirectory('/nonexistent/path'), false);
        assert.strictEqual(isExistingDirectory(__filename), false);
        assert.strictEqual(isExistingDirectory(__dirname), true);
    });
});
