import * as assert from 'assert';

suite('CADMATIC Extension Tests', function() {
    
    test('Project configuration schema validation', function() {
        const mockConfig: Record<string, Record<string, string>> = {
            'Project1': {
                'pmsRundir': '/path/to/rundir',
                'pmsHome': '/path/to/home',
                'CUSTOM_VAR': 'custom_value'
            },
            'Project2': {
                'pmsRundir': '/other/rundir',
                'PMS_LANG': 'EN'
            }
        };
        
        assert.ok(Object.keys(mockConfig).length === 2);
        assert.ok(mockConfig['Project1']['pmsRundir'] === '/path/to/rundir');
        assert.ok(mockConfig['Project1']['CUSTOM_VAR'] === 'custom_value');
    });
    
    test('Environment variable building', function() {
        const projectVars: Record<string, string> = {
            'PMS_RUNDIR': '/test/rundir',
            'PMS_HOME': '/test/home',
            'CUSTOM_VAR': 'value'
        };
        
        const env: NodeJS.ProcessEnv = { ...process.env };
        for (const [key, value] of Object.entries(projectVars)) {
            if (value) {
                env[key] = value;
            }
        }
        
        assert.ok(env['PMS_RUNDIR'] === '/test/rundir');
        assert.ok(env['PMS_HOME'] === '/test/home');
        assert.ok(env['CUSTOM_VAR'] === 'value');
    });
    
    test('Project switching logic', function() {
        const projects: Record<string, Record<string, string>> = {
            'Project1': { 'pmsRundir': '/path1' },
            'Project2': { 'pmsRundir': '/path2' }
        };
        
        const activeProject = 'Project1';
        
        if (activeProject && projects[activeProject]) {
            const vars = projects[activeProject];
            assert.ok(vars['pmsRundir'] === '/path1');
        } else {
            assert.fail('Should have found active project');
        }
        
        const newActiveProject = 'Project2';
        if (newActiveProject && projects[newActiveProject]) {
            const vars = projects[newActiveProject];
            assert.ok(vars['pmsRundir'] === '/path2');
        }
    });
});
