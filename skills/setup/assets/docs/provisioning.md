# Provisioning the server: from an empty cloud account to a Coolify host on the tailnet

This is the checklist for everything that happens *before* `/setup` can run. All of it
is console and terminal work a human does; no skill can click a cloud console for you.
What the skills do is verify it — `/setup` step 2 and `/health` probe your server's
public IP from the outside and compare the answer to `instance.yaml`. Work top to
bottom; each section ends with a *Done when* list that is the real test.

Two answers from the interview drive the whole thing, and this file is rendered from
them:

| Question | Your answer | Key in `instance.yaml` |
|---|---|---|
| Public-facing apps? | {{#HAS_PUBLIC}}**yes** — public lane at `*.{{PUBLIC_SUFFIX}}` ({{DNS_PROVIDER}}){{/HAS_PUBLIC}}{{^HAS_PUBLIC}}**no** — internal tools only, everything on the tailnet{{/HAS_PUBLIC}} | `domains.public_suffix` |
| Who may reach the Coolify dashboard? | **{{UI_EXPOSURE}}**{{#UI_TAILNET}} — the team over the tailnet, nobody else{{/UI_TAILNET}}{{#UI_GITHUB}} — the team over the tailnet, plus GitHub's webhook ranges so push-to-deploy works{{/UI_GITHUB}}{{#UI_INTERNET}} — anyone on the internet; 2FA is mandatory{{/UI_INTERNET}} | `exposure.coolify_ui` |

If either answer changes, change it in `instance.yaml`, re-render, and redo the
firewall section. The rest of the model is fixed: **internal tools are always Tailscale
Services on the tailnet**, and **a public lane exists only with a domain**.

{{#HOST_HETZNER}}Written for Hetzner Cloud. {{/HOST_HETZNER}}{{^HOST_HETZNER}}Written with Hetzner Cloud's console
paths as the example; `host.provider` is `other`, so translate each console step to
your provider's equivalent — the shape is identical. {{/HOST_HETZNER}}Any provider
whose firewall sits *outside* the VM works the same way; what does not work is a
firewall inside the VM (`ufw`) on its own — see *Why the cloud firewall* below.

---

## 1. The virtual machine

{{#HOST_HETZNER}}Hetzner Cloud console → your project → **Servers** → **Add server**.

- **Image**: Ubuntu **24.04 LTS**. (Coolify's installer supports Ubuntu LTS releases
  20.04, 22.04 and 24.04; pick 24.04.)
- **Type**: 2 vCPU / 4 GB is the floor (CPX22, CX23, or CAX11 on Arm); take 4 vCPU /
  8 GB (CPX32, CX33, CAX21) if Coolify will *build* images on this box rather than
  only run them. Arm is fine only if every image you will run has an arm64 build —
  when unsure, pick x86.
- **SSH key**: add your public key **here, at creation**. The console cannot add one
  afterwards.
- **Firewall**: attach the firewall from section 4 if it already exists; otherwise
  create the server now and attach it in section 4 — but do not install Coolify
  before the firewall is on.
- **Name**: anything; it is not the name anyone will type.

The `hcloud` CLI equivalent, if you prefer it:

```bash
hcloud server create --name coolify --type cpx22 --image ubuntu-24.04 --location nbg1 \
  --ssh-key <your-key-name> --firewall coolify
```
{{/HOST_HETZNER}}{{^HOST_HETZNER}}Create one VM: Ubuntu **24.04 LTS**, 2 vCPU / 4 GB as the floor, 4 vCPU / 8 GB if
Coolify will build images on it, your SSH public key installed at creation, a public
IPv4 address. Attach the provider's firewall (section 4) before installing Coolify.
{{/HOST_HETZNER}}
**Done when** you can `ssh root@<public-ip>` with your key. That is the last time the
public IP is used for SSH; from section 2 on, SSH goes over the tailnet.

---

## 2. Tailscale, before anything else

Do this before Coolify so that the moment the firewall closes, you already have a way
in.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

Follow the login URL it prints and sign in to the tailnet named in
`domains.internal_suffix` (`{{INTERNAL_SUFFIX}}`).

**Enable Tailscale SSH on the Coolify host — that is the `--ssh` flag, and it is not
optional here.** It runs an SSH server that answers **only on the Tailscale IP**,
authenticated by tailnet identity instead of keys, so port 22 is never open to the
internet and there is no key file to lose. It leaves the system `sshd` and
`authorized_keys` untouched (Coolify keeps using those, to itself, on localhost). If
Tailscale was already installed without it: `sudo tailscale set --ssh`. The tailnet
policy must allow it — the default policy's `ssh` section lets members reach their own
devices, and `docs/tailnet-access.md` covers the grant for a shared server. Beware
that turning it on drops any SSH session that is already open to the Tailscale IP.

Then, in the Tailscale admin console → **Machines** → this machine's row → **…** →
**Disable key expiry**. Without this the node's key expires after 180 days and every
internal tool goes dark at once. (Alternatively sign in with `--advertise-tags=tag:server`
after adding `tag:server` to `tagOwners` in the policy — tagged devices have expiry
disabled by default; `docs/tailnet-access.md` covers tags.)

Note the tailnet IP: `tailscale ip -4` (a `100.x.y.z` address). From now on that is the
address of this server for you and your team.

**Done when** `ssh root@<tailnet-ip>` works from your laptop, on the tailnet, **with no
key involved** (that is Tailscale SSH answering — `tailscale status` on the host lists
the machine with `ssh` among its capabilities), and the machine shows in the admin
console with key expiry disabled.

---

## 3. Coolify

Still with the firewall from section 4 **not yet relaxed** (or with the server not yet
reachable on 8000 from the internet — the order matters, see the race below):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

It installs Docker, creates `/data/coolify`, and prints `http://<public-ip>:8000`.
Ignore that address. Open **`http://<tailnet-ip>:8000`** from a machine on the tailnet
and **create the admin account immediately**. Coolify's own docs warn that whoever
reaches the registration page first owns the server — which is why 8000 is closed to
the internet until the account exists, whatever the eventual dashboard mode is.

Then, in Coolify:

- **Settings → General**: turn on **two-factor authentication** for the account{{#UI_INTERNET}} —
  mandatory in `internet` mode, where the login page is on the open internet{{/UI_INTERNET}}.
{{#HAS_PUBLIC}}- **Servers → localhost → General → Wildcard domain**: `https://{{PUBLIC_SUFFIX}}`.
  This is what makes every public resource get `<name>.{{PUBLIC_SUFFIX}}` and a
  certificate with no manual steps (section 5 makes the name resolve).
{{/HAS_PUBLIC}}- **Settings → General → URL** (the instance's own address): leave it **blank**{{#UI_TAILNET}}
  — the dashboard is reached at `http://<tailnet-ip>:8000` and nothing else{{/UI_TAILNET}}{{#UI_GITHUB}}
  — the GitHub App (section 6) will default to `http://<public-ip>:8000`, which is what
  GitHub must reach; setting a URL here later changes that and means editing the
  GitHub App's URLs by hand{{/UI_GITHUB}}{{#UI_INTERNET}}
  — the GitHub App (section 6) will default to `http://<public-ip>:8000`; setting a URL
  here later changes that and means editing the GitHub App's URLs by hand. With a
  public lane you may instead put the dashboard behind `https://coolify.{{PUBLIC_SUFFIX}}`
  here, which gets TLS but changes nothing about who can reach the login page{{/UI_INTERNET}}.
- **Keys & Tokens → API tokens**: create the token the Coolify MCP will use — read,
  write and deploy scopes, **never root** (`docs/platform.md`, *Token scoping*). It goes
  into your shell as `COOLIFY_ACCESS_TOKEN`, never into a file.

**Done when** you are logged in at `http://<tailnet-ip>:8000` with 2FA on, and
`curl http://<tailnet-ip>:8000` from the tailnet answers.

---

## 4. The cloud firewall — what enforces the lanes

### Why the cloud firewall, and not `ufw`

Docker publishes a container port by rewriting iptables *ahead of* the host firewall's
own chain, so `ufw` never sees that traffic: Docker's documentation says the two are
"incompatible", and Coolify's firewall page says the same and recommends the cloud
provider's firewall. A firewall that sits outside the VM{{#HOST_HETZNER}} — Hetzner's Cloud
Firewall{{/HOST_HETZNER}} — is not subject to any of that. It is the guarantee behind
"internal tools have no published port": if a `ports:` line ever slips into an internal
tool's compose, the cloud firewall is what keeps it off the public IP.

Do not add `ufw` on top. It buys nothing here and it *can* break Coolify, which SSHes to
itself on port 22 (traffic that never crosses the cloud firewall, but that `ufw` would
block).

### The rules

Allow-list only; everything not listed is dropped. No outbound rules (that keeps all
outbound open — Tailscale, Docker pulls, Let's Encrypt).

| # | Inbound | Source | Why |
|---|---|---|---|
{{#HAS_PUBLIC}}| 1 | TCP 80 | `0.0.0.0/0`, `::/0` | Let's Encrypt HTTP challenge and the HTTP→HTTPS redirect (public lane) |
| 2 | TCP 443 | `0.0.0.0/0`, `::/0` | The public lane, via Traefik |
{{/HAS_PUBLIC}}{{#UI_GITHUB}}| 3 | TCP 8000 | GitHub's webhook ranges (below) | Push-to-deploy webhooks to the Coolify instance URL |
{{/UI_GITHUB}}{{#UI_INTERNET}}| 3 | TCP 8000 | `0.0.0.0/0`, `::/0` | The Coolify dashboard and push-to-deploy webhooks (`internet` mode) |
{{/UI_INTERNET}}{{^HAS_PUBLIC}}{{#UI_TAILNET}}| — | *(no rules at all)* | | Nothing inbound. The tailnet needs no open port, and there is no public lane |
{{/UI_TAILNET}}{{/HAS_PUBLIC}}
Deliberately **not** in the list:

- **Tailscale** — needs no inbound rule. It dials out on 443 and UDP, and relays through
  Tailscale's DERP servers if it cannot punch through; a cloud VM with a public IP
  almost always gets a direct connection anyway. Opening UDP 41641 is optional and
  only ever affects throughput, never reachability.
- **22 (SSH)** — closed. SSH goes over the tailnet (section 2).
- **8000, 6001, 6002 from the internet**{{#UI_INTERNET}} — 6001 and 6002 (Coolify's realtime
  and terminal channels) stay closed even in `internet` mode; the dashboard works
  without them from outside, and the team has them over the tailnet{{/UI_INTERNET}}{{^UI_INTERNET}} —
  the dashboard is a tailnet thing{{#UI_GITHUB}}, with the single GitHub exception in rule 3{{/UI_GITHUB}}{{/UI_INTERNET}}.
- **Anything an app listens on** (3000, 8080, …) — never. Internal tools are reached by
  the tailnet registrar over the container network; public ones by Traefik on 443.
{{#UI_GITHUB}}
### GitHub's webhook ranges

GitHub publishes them at `https://api.github.com/meta`, key `hooks`; get the current
list, IPv4 and IPv6, with:

```bash
curl -s https://api.github.com/meta | jq -r '.hooks[]'
```

Six CIDRs at the time of writing. They change rarely, but they do change — when a push
stops deploying, this list is the first thing to re-check. GitHub also signs every
webhook with the secret Coolify generated, so the allow-list is a second layer, not
the only one.
{{/UI_GITHUB}}
{{#HOST_HETZNER}}### Creating it

Console → project → **Firewalls** → **Create Firewall** → add the inbound rules from the
table (protocol TCP, port, then the source IPs in the text box — "if no IP address is
added, all connections will be dropped", which is exactly the point for anything not
listed) → **Apply to** → this server → **Create Firewall**.

Or with the CLI:

```bash
hcloud firewall create --name coolify
{{#HAS_PUBLIC}}hcloud firewall add-rule coolify --direction in --protocol tcp --port 80  --source-ips 0.0.0.0/0,::/0 --description "public lane: ACME + redirect"
hcloud firewall add-rule coolify --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0,::/0 --description "public lane: Traefik"
{{/HAS_PUBLIC}}{{#UI_GITHUB}}hcloud firewall add-rule coolify --direction in --protocol tcp --port 8000 --description "Coolify: GitHub webhooks" \
  --source-ips "$(curl -s https://api.github.com/meta | jq -r '.hooks | join(",")')"
{{/UI_GITHUB}}{{#UI_INTERNET}}hcloud firewall add-rule coolify --direction in --protocol tcp --port 8000 --source-ips 0.0.0.0/0,::/0 --description "Coolify dashboard (internet mode)"
{{/UI_INTERNET}}hcloud firewall apply-to-resource coolify --type server --server coolify
```

Hetzner's firewall is stateful, free, allows up to 100 source CIDRs per rule, and
applies to the server's public IPv4 and IPv6. It does not filter Hetzner private
networks, which this setup does not use.
{{/HOST_HETZNER}}{{^HOST_HETZNER}}### Creating it

Create the provider's firewall with exactly the inbound rules in the table, no outbound
rules, and attach it to the server. Confirm in the provider's docs that it is enforced
outside the VM (not an agent inside it) — if it is not, it is subject to the same Docker
bypass as `ufw`, and `chaifeng/ufw-docker` on the host is the fallback.
{{/HOST_HETZNER}}
**Done when** the probe in section 7 shows exactly the expected answer.

---

{{#HAS_PUBLIC}}## 5. Public DNS — the wildcard record

{{#DNS_CLOUDFLARE}}In Cloudflare, for the zone that holds `{{PUBLIC_SUFFIX}}`:

1. An **A record for `*.{{PUBLIC_SUFFIX}}`** pointing at the server's public IPv4,
   proxy status **DNS only** (grey cloud). Traefik needs to see the client and to answer
   the Let's Encrypt challenge itself.
2. An **API token** scoped to *Zone → DNS → Edit* on that zone only. It goes into the
   `{{PUBLIC_DNS}}` service's env store during `/setup`, never into a file. That service
   keeps the record pinned to the server's current IP, every 5 minutes, so the record
   you created by hand is the last one anyone creates by hand.
{{/DNS_CLOUDFLARE}}{{#DNS_DUCKDNS}}At duckdns.org, signed in:

1. Create the subdomain `{{PUBLIC_SUFFIX}}` and point it at the server's public IPv4.
   DuckDNS resolves **every** name under it (`wiki.{{PUBLIC_SUFFIX}}`,
   `a.b.{{PUBLIC_SUFFIX}}`) to that same address — that implicit wildcard is the whole
   reason it works here with a single record and nothing else to create.
2. Copy the account **token** from the top of the page. It goes into the
   `{{PUBLIC_DNS}}` service's env store during `/setup` (the `linuxserver/duckdns`
   updater, env `SUBDOMAINS` and `TOKEN`), never into a file. That service re-pins the
   record every 5 minutes.

Certificates: Traefik issues one per hostname through the ordinary HTTP challenge, so
nothing wildcard-shaped is needed, and because `duckdns.org` is on the Public Suffix
List, Let's Encrypt's per-domain rate limit counts `{{PUBLIC_SUFFIX}}` as its own
domain rather than lumping you in with every other DuckDNS user.

DuckDNS is the free way to start. A company should own its domain; moving later means
changing `domains.public_suffix` and `plumbing.public_dns_provider`, re-rendering, and
redeploying the pinner — the lane itself does not change.
{{/DNS_DUCKDNS}}
**Done when** `dig +short anything.{{PUBLIC_SUFFIX}}` from anywhere returns the server's
public IP, and the wildcard domain is set in Coolify (section 3).

---

{{/HAS_PUBLIC}}{{^HAS_PUBLIC}}## 5. Public DNS

Not applicable: no public lane. Ports 80 and 443 are closed, no domain exists, and
nothing on this server is meant to be reachable from the internet. If that changes,
answer *yes* to public-facing apps in `instance.yaml` (set `domains.public_suffix` to a
domain you own or a free DuckDNS one), re-render, and this section fills itself in.

---

{{/HAS_PUBLIC}}## 6. Push-to-deploy (the GitHub App)

{{#UI_TAILNET}}Not available in `tailnet` mode: GitHub has to open a connection to the Coolify
instance to deliver a push webhook, and nothing from the internet can. Deploys are
triggered from the dashboard or through the MCP (`deploy`). To get push-to-deploy,
switch `exposure.coolify_ui` to `github`, re-render, add firewall rule 3, and come back
here.
{{/UI_TAILNET}}{{^UI_TAILNET}}Push-to-deploy works **without any domain**: GitHub posts each push to the Coolify
instance URL, and Coolify defaults that to `http://<public-ip>:8000` when no instance
URL is set. Verified in practice. What it needs is only that GitHub can reach port
8000 — rule 3 above.

Once, per GitHub account or organisation: Coolify → **Sources** → **GitHub App** →
create. Coolify builds the app manifest with the webhook, redirect and callback URLs
all under the endpoint shown in the dropdown; leave it at `http://<public-ip>:8000`.
GitHub then sends the browser back to that same endpoint to finish the registration.
{{#UI_GITHUB}}
**In `github` mode that round trip fails unless your own IP is allowed too**, because
your browser is not in GitHub's ranges. So, for the duration of this one step, add
your current public IP (`curl -s https://api.ipify.org`) as a source on rule 3, do the
registration, then remove it again. *Unverified as of 2026-09-08* — the first trial on
a real machine settles whether anything else in the flow needs the browser to reach
that endpoint; if it does, `internet` mode with 2FA is the fallback.
{{/UI_GITHUB}}
When hosting from a repo (`/host`), pick that GitHub App as the source and the default
branch; every push to it redeploys. **Verify with a real push** to a throwaway repo, not
by reading settings — a webhook that is not arriving fails silently on GitHub's side
(the delivery log under the app's *Advanced* tab shows it).

If an instance URL is set in Coolify later (a domain for the dashboard), the GitHub
App keeps the old `http://<public-ip>:8000` URLs and stops working until they are
edited on GitHub by hand.
{{/UI_TAILNET}}
---

## 7. Verify from the outside, then hand over to `/setup`

From any machine on the internet **that is not on the tailnet** (or with Tailscale
off), probe the public IP:

```bash
IP=<public-ip>
for p in 22 80 443 3000 8000 6001 6002; do
  timeout 3 bash -c "</dev/tcp/$IP/$p" 2>/dev/null && echo "$p OPEN" || echo "$p closed"
done
```

Expected for this instance:

| Port | Expected | Because |
|---|---|---|
| 22 | closed | SSH is tailnet-only |
| 80, 443 | {{#HAS_PUBLIC}}**OPEN**{{/HAS_PUBLIC}}{{^HAS_PUBLIC}}closed{{/HAS_PUBLIC}} | {{#HAS_PUBLIC}}public lane{{/HAS_PUBLIC}}{{^HAS_PUBLIC}}no public lane{{/HAS_PUBLIC}} |
| 8000 | {{#UI_INTERNET}}**OPEN**{{/UI_INTERNET}}{{^UI_INTERNET}}closed{{/UI_INTERNET}} | {{#UI_TAILNET}}dashboard is tailnet-only{{/UI_TAILNET}}{{#UI_GITHUB}}`github` mode — open to GitHub's ranges only, so *closed from here* is the rule working{{/UI_GITHUB}}{{#UI_INTERNET}}`internet` mode{{/UI_INTERNET}} |
| 3000, 6001, 6002 | closed | always |

Then from a machine **on** the tailnet: `curl -sI http://<tailnet-ip>:8000` answers.

**Done when** both match. `/setup` repeats the outside probe itself before it trusts the
instance, and records the result in `docs/infrastructure.md`; `/health` repeats it on
every sweep. From here: export `COOLIFY_BASE_URL={{#COOLIFY_URL}}{{COOLIFY_URL}}{{/COOLIFY_URL}}{{^COOLIFY_URL}}http://<tailnet-ip>:8000{{/COOLIFY_URL}}` and the
token, start Claude Code in the deployment repo, and run `/setup`.
