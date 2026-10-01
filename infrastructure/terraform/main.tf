# Terraform for the production VPS (learn/llmops Module 7) - matches docs/DEPLOY.md's
# manually-provisioned spec exactly (Hetzner Cloud, CX22, Ubuntu 24.04, Falkenstein).
#
# Plan-only in this sandbox: no real hcloud_token was ever used, and `terraform
# apply` was never run. If this is ever used for real, `terraform apply` still
# needs the infrastructure owner's explicit, in-the-moment approval - Terraform
# itself provides no such gate.

terraform {
  required_version = ">= 1.7"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "vindera" {
  name       = "vindera-deploy"
  public_key = var.ssh_public_key
}

resource "hcloud_firewall" "vindera" {
  name = "vindera-backend"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_allowed_ips
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "vindera" {
  name        = "vindera-prod"
  server_type = "cx22"
  image       = "ubuntu-24.04"
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.vindera.id]
  firewall_ids = [hcloud_firewall.vindera.id]

  labels = {
    project = "vindera"
    env     = "production"
  }
}
