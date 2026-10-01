variable "hcloud_token" {
  description = "Hetzner Cloud API token. Never commit a real value - pass it as TF_VAR_hcloud_token or in a git-ignored terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Public half of the SSH key used to reach the server (see docs/DEPLOY.md)."
  type        = string
}

variable "ssh_allowed_ips" {
  description = "CIDR blocks allowed to reach port 22. Prefer your own current IP over 0.0.0.0/0."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "location" {
  description = "Hetzner datacenter. docs/DEPLOY.md allows Falkenstein or Nuremberg."
  type        = string
  default     = "fsn1"
}
