type MetricLabels = { method: string; operation: string; status: string };

/** Process-local Prometheus counters. Aggregate them in the deployment monitoring system. */
export class HttpMetrics {
  private readonly requests = new Map<string, { labels: MetricLabels; value: number }>();

  record(method: string, path: string, status: number): void {
    const labels: MetricLabels = { method, operation: operationFor(path, method), status: String(status) };
    const key = `${labels.method}\u0000${labels.operation}\u0000${labels.status}`;
    const existing = this.requests.get(key);
    if (existing) existing.value += 1;
    else this.requests.set(key, { labels, value: 1 });
  }

  render(): string {
    const lines = [
      "# HELP label_cloud_http_requests_total API requests grouped by stable business operation and HTTP result.",
      "# TYPE label_cloud_http_requests_total counter",
    ];
    for (const { labels, value } of [...this.requests.values()].sort((a, b) => a.labels.operation.localeCompare(b.labels.operation))) {
      lines.push(`label_cloud_http_requests_total{method="${labels.method}",operation="${labels.operation}",status="${labels.status}"} ${value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

function operationFor(path: string, method: string): string {
  if (path === "/api/v1/auth/login") return "auth_login";
  if (path === "/api/v1/auth/register") return "auth_register";
  if (path === "/api/v1/auth/refresh") return "auth_refresh";
  if (path.startsWith("/api/v1/auth/password/")) return "auth_password_reset";
  if (path === "/api/v1/me/account-deletion") return "account_deletion";
  if (path === "/api/v1/internal/billing/events") return "billing_webhook";
  if (path === "/api/v1/internal/desktop-releases") return "release_admin";
  if (path === "/api/v1/labels" && method === "POST") return "label_create";
  if (path.startsWith("/api/v1/labels/")) return method === "PUT" || method === "PATCH" ? "label_save" : "label_read_or_delete";
  if (path.startsWith("/api/v1/assets/")) return path.endsWith("/upload") || path.endsWith("/complete") ? "asset_upload" : "asset_read_or_delete";
  if (path === "/api/v1/assets/initiate") return "asset_initiate";
  if (path.startsWith("/api/v1/official-templates")) return "official_template";
  if (path.startsWith("/api/v1/desktop-updates")) return "desktop_update";
  return "other";
}
