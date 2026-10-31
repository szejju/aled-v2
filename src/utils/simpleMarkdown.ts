/**
 * Podgląd Markdown w panelu admina.
 * Najpierw escapuje HTML, linki i obrazki dopuszcza tylko dla http(s).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function allowUrl(escaped: string): boolean {
  const value = escaped
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
  return /^https?:\/\//i.test(value) && !/[\s"'<>]/.test(value)
}

export function simpleMarkdown(text: string, options?: { links?: boolean }): string {
  if (!text) return ''
  let html = escapeHtml(text)
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  if (options?.links) {
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (full, alt: string, url: string) => {
      if (!allowUrl(url)) return full
      return `<img src="${url}" alt="${alt}" class="rounded-xl my-2 max-w-full"/>`
    })
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, (full, label: string, url: string) => {
      if (!allowUrl(url)) return full
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-lime underline">${label}</a>`
    })
  }

  return html.replace(/\n/g, '<br/>')
}
