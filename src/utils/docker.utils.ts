import compose from 'docker-compose';
import path from 'path';

export interface DockerComposeOptions {
    cwd?: string;
    config?: string;
    log?: boolean;
}

export async function startDockerContainer(options: DockerComposeOptions = {}) {
    const {
        cwd = process.cwd(),
        config = 'docker.yml',
        log = true
    } = options;

    try {
        console.log(`Starting Postgres/Docker container using config "${config}"...`);

        await compose.upAll({
            cwd: path.resolve(cwd),
            config,
            log
        });

        console.log(`✅ Docker container (${config}) is up and running!`);
    } catch (err: any) {
        console.error(`Failed to start Docker container (${config}):`, err.message || err);
        throw err;
    }
}
