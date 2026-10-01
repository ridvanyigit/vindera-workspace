output "server_ipv4" {
  description = "Public IPv4 address - point the DNS records from docs/DEPLOY.md at this."
  value       = hcloud_server.vindera.ipv4_address
}

output "server_id" {
  value = hcloud_server.vindera.id
}
