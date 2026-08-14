"""One-time SSH key installer.

No host, username, password, or trust-on-first-use policy is embedded in the repository.
The destination must already have a verified host key in ~/.ssh/known_hosts.
"""
import getpass
import os
import shlex

import paramiko

hostname = os.environ.get('SSH_HOST')
username = os.environ.get('SSH_USER')
port = int(os.environ.get('SSH_PORT', '22'))
if not hostname or not username:
    raise SystemExit('Set SSH_HOST and SSH_USER. Optionally set SSH_PORT.')
password = getpass.getpass('SSH password (not stored): ')
pub_key_path = os.path.expanduser(os.environ.get('SSH_PUBLIC_KEY_PATH', '~/.ssh/id_ed25519.pub'))

with open(pub_key_path, 'r', encoding='utf-8') as key_file:
    pub_key = key_file.read().strip()

ssh = paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(hostname, port=port, username=username, password=password, look_for_keys=False)

quoted_key = shlex.quote(pub_key)
commands = [
    'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
    f'touch ~/.ssh/authorized_keys && grep -qF -- {quoted_key} ~/.ssh/authorized_keys || printf "%s\\n" {quoted_key} >> ~/.ssh/authorized_keys',
    'chmod 600 ~/.ssh/authorized_keys',
]
for command in commands:
    _stdin, stdout, stderr = ssh.exec_command(command)
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(stderr.read().decode().strip() or 'Remote command failed')

ssh.close()
print('SSH public key installed successfully.')
