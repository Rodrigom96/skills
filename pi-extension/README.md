# Gondolin / Docker sandbox

This extension runs pi's `read`, `write`, `edit`, and `bash` tools (including user `!` commands) in a sandbox. Docker is the default; Gondolin remains available as an opt-in backend.

## Docker backend

Install Docker and make sure the current user can access its daemon. Docker is used by default:

```sh
pi
```

To select it explicitly:

```sh
PI_SANDBOX=docker pi
```

Use Gondolin instead with `PI_SANDBOX=gondolin pi`.

The default image is `node:22-bookworm`; override it with `PI_DOCKER_IMAGE`:

```sh
PI_SANDBOX=docker PI_DOCKER_IMAGE=ubuntu:24.04 pi
```

Use `/sandbox gondolin` or `/sandbox docker` to switch during a session, or `/sandbox` to choose interactively. An already-running container is long-lived for the session and is removed on shutdown.

Docker bind-mounts the project and skill parent directories at their same absolute paths inside the container. Project mounts are writable unless configured otherwise, so container writes affect the host. Commands and file utilities therefore depend on what is installed in the selected image; use the approved `host_bash` tool for host-only tools such as npm, Python, or build systems.

If `PI_SANDBOX` is unset or set to `docker`, Docker is used. Set `PI_SANDBOX=gondolin` to use Gondolin.
