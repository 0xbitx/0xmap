# Networking from the Command Line

Linux treats networking as a set of interfaces, addresses, routes, sockets and name resolution rules. You do not need to memorize every protocol to operate a system, but you do need to answer basic questions: what address is this host using, where does traffic go, which process is listening, and can I reach the other side?

## Interfaces and addresses

```bash
ip link
ip addr
ip -brief addr
```

An interface is a network device. `lo` is the loopback interface, usually `127.0.0.1` and `::1`. `eth0`, `ens18` or `enp0s3` are common wired interface names. Wi-Fi interfaces often start with `wl`.

An address belongs to an interface. A host can have multiple IPv4 and IPv6 addresses. `ip addr` shows the address, prefix length and state.

```bash
ip addr show dev eth0
ip -6 addr
```

Bring an interface up or down only when you understand the impact:

```bash
sudo ip link set dev eth0 up
sudo ip link set dev eth0 down
```

On a remote system, bringing down the interface you are connected through will end your session.

## Routes

A route tells the kernel where to send a packet.

```bash
ip route
ip -6 route
ip route get 1.1.1.1
```

The default route, marked `default`, is the path to the internet or another network. A more specific route wins over a less specific one. `ip route get` shows the route the kernel would choose for a destination.

```bash
ip route add 10.20.0.0/16 via 192.168.1.1
sudo ip route del 10.20.0.0/16
```

Routes added with `ip` are temporary unless you configure them persistently in the network manager. Test carefully before changing the default route.

## Name resolution

DNS turns names into addresses. Linux uses the resolver configuration in `/etc/resolv.conf`, often managed by systemd-resolved or NetworkManager.

```bash
cat /etc/resolv.conf
resolvectl status
getent hosts example.com
dig example.com
dig +short example.com
```

`getent hosts` uses the same name service switch path as normal applications. `dig` queries DNS directly and shows the full response. If `ping example.com` fails but `ping 1.1.1.1` works, name resolution is the first suspect.

The hosts file can override DNS:

```bash
cat /etc/hosts
```

Be careful when editing it. A stale entry can make a service unreachable even when DNS is healthy.

## Ports and sockets

A socket is an endpoint for communication. A listening socket waits for incoming connections.

```bash
ss -tulpn
ss -tan
ss -tulpn | grep ':22'
```

| Option | Meaning |
| --- | --- |
| `-t` | TCP |
| `-u` | UDP |
| `-l` | Listening sockets |
| `-p` | Show the process, when permitted |
| `-n` | Do not resolve names |
| `-a` | All sockets |

The local address `0.0.0.0:22` means the service listens on every IPv4 interface. `127.0.0.1:5432` means it listens only on loopback. That difference matters for exposure.

`lsof -i` and `fuser` can also identify processes using a port, but `ss` is usually faster and more direct.

## Test connectivity

```bash
ping -c 4 1.1.1.1
ping -c 4 example.com
traceroute example.com
curl -I https://example.com
curl -v https://example.com
```

`ping` tests ICMP reachability, not whether a particular service is available. Many networks block ICMP. `traceroute` shows the path, subject to filtering. `curl -I` fetches response headers and is a quick way to test an HTTP endpoint.

For a TCP port without a dedicated client, use a short timeout:

```bash
timeout 3 bash -c '</dev/tcp/example.com/443' && echo open
```

This is a shell feature, not a replacement for a proper network scanner. Use it only on systems you are authorized to test.

## Download files with curl and wget

`curl` and `wget` both fetch content over HTTP and HTTPS. `curl` is a general request tool. `wget` is optimized for downloading files and resuming interrupted transfers.

```bash
curl -fLO https://example.com/releases/tool-1.2.3.tar.gz
curl -fL -o tool.tar.gz https://example.com/releases/tool-1.2.3.tar.gz
curl -C - -O https://example.com/releases/tool-1.2.3.tar.gz
curl -I https://example.com

wget https://example.com/releases/tool-1.2.3.tar.gz
wget -c https://example.com/releases/tool-1.2.3.tar.gz
wget -O tool.tar.gz 'https://example.com/download?id=42'
wget --spider https://example.com
```

| Option | Meaning |
| --- | --- |
| `-f` | Fail on HTTP errors instead of saving an error page |
| `-L` | Follow redirects |
| `-O` | Use the remote filename in `curl`; choose a filename in `wget` |
| `-o` | Write to a chosen filename in `curl` |
| `-C -` | Resume a partial download in `curl` |
| `-c` | Continue a partial download in `wget` |
| `--spider` | Check that a URL exists without saving it in `wget` |

After a download, verify the checksum or signature from a source you trust:

```bash
sha256sum tool-1.2.3.tar.gz
gpg --verify tool-1.2.3.tar.gz.sig tool-1.2.3.tar.gz
```

HTTPS protects the transfer, not the publisher. A valid TLS connection to a compromised site still delivers malicious content. Never pipe a download directly into a shell:

```bash
curl -fsSL https://example.com/install.sh | sh
```

Download the script, read it, verify it, then run it. If credentials are required, use a header or an authenticated configuration file with restrictive permissions. Do not put secrets in a URL that will appear in shell history and logs.

## SSH essentials

SSH provides encrypted remote shells and file transfer.

```bash
ssh user@host
ssh -p 2222 user@host
ssh -i ~/.ssh/lab_key user@host
```

Generate a key pair:

```bash
ssh-keygen -t ed25519 -a 100 -C 'lab key'
```

The private key stays on your machine. The public key goes to the remote account's `~/.ssh/authorized_keys`. `ssh-copy-id` automates the first copy:

```bash
ssh-copy-id -i ~/.ssh/lab_key.pub user@host
```

A per-host configuration in `~/.ssh/config` keeps options readable:

```text
Host lab
    HostName 192.0.2.10
    User alice
    Port 2222
    IdentityFile ~/.ssh/lab_key
```

Then `ssh lab` uses those settings. File transfer:

```bash
scp report.txt lab:/tmp/
scp lab:/var/log/syslog ./syslog-copy
```

For interactive file transfer, `sftp lab` works over the same SSH connection.

## Firewalls in one minute

A firewall decides which traffic is allowed. On Ubuntu, `ufw` is a common front end:

```bash
sudo ufw status verbose
sudo ufw allow 22/tcp
sudo ufw enable
```

On systems using nftables directly:

```bash
sudo nft list ruleset
```

Before enabling a firewall on a remote host, allow your SSH port. Otherwise you can lock yourself out. A firewall rule is only one layer; services should also bind to the right interface and use authentication.

## Addressing, prefixes and subnetting

An IPv4 address is 32 bits, usually written as four decimal octets. A prefix length says how many leading bits identify the network.

```text
192.168.1.10/24
```

`/24` means the first 24 bits are the network and the last 8 bits identify the host. The network address is `192.168.1.0`, the usable range is usually `192.168.1.1` to `192.168.1.254`, and the broadcast address is `192.168.1.255`.

Private IPv4 ranges are not routed on the public internet:

| Range | Common use |
| --- | --- |
| `10.0.0.0/8` | Large private networks |
| `172.16.0.0/12` | Private networks |
| `192.168.0.0/16` | Home and small office networks |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local, often a sign of failed DHCP |

IPv6 addresses are 128 bits and written in hexadecimal with colons. `::` compresses one run of zero groups. `::1` is loopback. Link-local addresses begin with `fe80::` and are scoped to an interface.

Useful address tools:

```bash
ipcalc 192.168.1.10/24
ip -brief addr
ip -6 addr
ip route get 8.8.8.8
```

`ipcalc` may need to be installed. It shows the network, broadcast, host range and mask. `ip route get` shows which interface and source address the kernel would use for a destination.

A host can have multiple addresses on one interface. That is normal for IPv4 and IPv6, for aliases and for containers. Do not assume one interface equals one address.

## DHCP and persistent network configuration

DHCP assigns addresses, routes and DNS settings automatically. A DHCP client usually runs at boot and renews the lease periodically.

```bash
ip -brief addr
networkctl status
resolvectl status
```

A `169.254.x.x` address often means the DHCP server did not respond. Check the link, the switch, the DHCP service and the lease logs.

Persistent configuration depends on the distribution and the network manager:

| Stack | Typical configuration |
| --- | --- |
| NetworkManager | `nmcli`, `nmtui`, `/etc/NetworkManager/` |
| systemd-networkd | `/etc/systemd/network/*.network` |
| netplan | `/etc/netplan/*.yaml`, often with NetworkManager or networkd as a backend |
| ifupdown | `/etc/network/interfaces` |
| Red Hat family | `/etc/sysconfig/network-scripts/` or NetworkManager keyfiles |

Inspect before editing:

```bash
nmcli device status
nmcli connection show
networkctl list
cat /etc/netplan/*.yaml
```

Netplan applies YAML configuration:

```bash
sudo netplan try
sudo netplan apply
```

`netplan try` applies the change with a rollback timer. Use it on remote systems so a mistake does not immediately lock you out.

Do not edit a file owned by a network manager and expect the manager to ignore it. Changes may be overwritten at the next boot. Use the manager's own tooling.

## Packet capture and port inspection

`tcpdump` captures packets. It is the command-line workhorse for checking what is actually on the wire.

```bash
sudo tcpdump -i any -nn
sudo tcpdump -i eth0 -nn port 22
sudo tcpdump -i eth0 -nn host 192.0.2.10
sudo tcpdump -i eth0 -nn -c 20 -w capture.pcap
sudo tcpdump -r capture.pcap -nn
```

| Filter | Meaning |
| --- | --- |
| `host 192.0.2.10` | Traffic to or from one host |
| `src host 192.0.2.10` | Traffic from one host |
| `dst port 443` | Traffic to one port |
| `tcp` | TCP traffic only |
| `udp` | UDP traffic only |
| `icmp` | ICMP traffic only |
| `port 53` | DNS traffic, usually |
| `net 10.0.0.0/8` | Traffic to or from a network |

`-nn` disables name and port resolution, which keeps output fast and unambiguous. `-c` limits the packet count. `-w` writes a pcap file. `-r` reads one.

`tshark` provides protocol decoding and display filters:

```bash
tshark -r capture.pcap
tshark -r capture.pcap -Y 'http.request'
tshark -r capture.pcap -T fields -e ip.src -e ip.dst -e tcp.dstport
```

`nmap` is a network scanner. Use it only on systems you own or have explicit written permission to test.

```bash
nmap -sn 192.0.2.0/24
nmap -sT -p 22,80,443 192.0.2.10
nmap -sV -p 22,80,443 192.0.2.10
```

`-sn` is a host discovery scan. `-sT` uses a full TCP connection. `-sV` tries to identify service versions. Scans generate traffic and logs. Authorization comes before curiosity.

## Firewalls beyond ufw

`ufw` is a friendly front end. Underneath, Linux uses netfilter. On modern systems, `nftables` is the default framework. Some systems still use `iptables`.

```bash
sudo ufw status numbered
sudo ufw allow from 192.0.2.0/24 to any port 22 proto tcp
sudo ufw delete 2
sudo nft list ruleset
sudo iptables -L -n -v
```

`ufw status numbered` shows rule numbers for deletion. `nft list ruleset` prints the current nftables rules. `iptables -L -n -v` prints the legacy or compatibility view, depending on the system.

A firewall policy needs a default stance:

- Drop or reject inbound traffic that is not explicitly allowed.
- Allow established and related connections.
- Allow only the services that should be reachable.
- Restrict management access by source network when possible.
- Log denied traffic sparingly, or the logs become noise.

Before enabling a firewall on a remote host, allow your SSH source and port. Test from a second session. Keep a console or recovery path open.

## SSH tunnels and hardening

SSH can forward ports and create tunnels.

```bash
ssh -L 8080:127.0.0.1:80 user@host
ssh -R 9000:127.0.0.1:3000 user@host
ssh -D 1080 user@host
```

`-L` forwards a local port to a remote destination. `-R` forwards a remote port to a local destination. `-D` starts a SOCKS proxy. These features are powerful and should be used within policy.

A per-host configuration keeps commands short:

```text
Host lab
    HostName 192.0.2.10
    User alice
    Port 2222
    IdentityFile ~/.ssh/lab_key
    ServerAliveInterval 30
```

Then:

```bash
ssh lab
scp report.txt lab:/tmp/
```

Server hardening starts with `/etc/ssh/sshd_config` and drop-in files under `/etc/ssh/sshd_config.d/`.

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers alice
MaxAuthTries 3
```

Validate before restarting:

```bash
sudo sshd -t
sudo systemctl reload ssh
```

Keep your current session open while testing a new SSH configuration. If the new configuration rejects you, the old session is your way back in.

## DNS and network performance

DNS problems often look like general network failures. Test name resolution separately from connectivity.

```bash
getent hosts example.com
dig example.com
dig +short example.com
dig @1.1.1.1 example.com
resolvectl query example.com
```

`getent hosts` uses the system resolver path. `dig` queries DNS directly. `dig @server` tests a specific resolver. `resolvectl query` uses systemd-resolved when it is active.

If an IP address works but a hostname does not, check `/etc/resolv.conf`, the resolver manager, `/etc/hosts` and the DNS server. If both fail, check the interface, route and firewall.

Network statistics:

```bash
ss -s
ip -s link
ip -s link show dev eth0
mtr example.com
```

`ss -s` summarizes sockets. `ip -s link` shows interface counters, including errors and drops. `mtr` combines traceroute and ping over time. A few dropped packets may be normal. A growing error count is not.

## Network command quick reference

| Task | Command |
| --- | --- |
| Show addresses | `ip -brief addr` |
| Show routes | `ip route` |
| Query DNS | `dig +short example.com`, `getent hosts example.com` |
| List listening sockets | `ss -tulpn` |
| Test reachability | `ping -c 4 example.com` |
| Test an HTTP endpoint | `curl -I https://example.com` |
| Trace a path | `traceroute example.com` |
| Capture traffic | `sudo tcpdump -i any -nn` |
| Check NetworkManager | `nmcli device status` |
| Legacy interface view | `ifconfig`, replaced by `ip` |
| Legacy socket view | `netstat -tulnp`, replaced by `ss` |
| Legacy DNS query | `nslookup example.com`, replaced by `dig` |

`ifconfig`, `netstat` and `nslookup` still appear in older guides and may be installed for compatibility. Prefer `ip`, `ss` and `dig` or `getent`. If a legacy command is missing, install the package that provides it only when you have a reason. Do not add tools just to follow an old tutorial.

## Lab: map your own host

```bash
ip -brief addr
ip route
cat /etc/resolv.conf
getent hosts example.com
ss -tulpn
ping -c 2 127.0.0.1
curl -I https://example.com
```

Then answer:

1. Which interface has the default route?
2. Which DNS resolver is configured?
3. Which TCP ports are listening on all interfaces?
4. Which services are listening only on loopback?
5. Does `example.com` resolve to an IPv4 address, an IPv6 address or both?

## Common mistakes

- Confusing a listening port with a reachable service.
- Editing DNS settings without checking which resolver manager owns the file.
- Enabling a firewall before allowing SSH.
- Using `ping` as proof that an application is healthy.
- Copying a private SSH key to a remote host.

## Checkpoint

You should now be able to:

- Read interface, address and route information.
- Diagnose a DNS problem separately from a connectivity problem.
- Identify listening sockets and their processes.
- Test HTTP and SSH connectivity.
- Make a basic firewall change without locking yourself out.

Next you will turn these commands into reusable Bash scripts.
