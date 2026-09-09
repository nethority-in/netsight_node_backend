// Shared helper that builds the dynamic HTML sections for the
// ns_temp_Notification_temp1 / temp2 templates.
// This is the SAME logic used by previewTemplateHtml so email and
// WhatsApp-media rendering stay in sync. Kept in one place to avoid drift.

export function buildTemplateParams(
  templateName: string,
  rawParams: Record<string, any>,
): Record<string, any> {
  const params: Record<string, any> = { ...rawParams };

  // --- Normalize / format scalar values ---
  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] === null || params[key] === undefined) {
      // Leave arrays/objects alone; only blank out scalars
      if (typeof params[key] !== 'object') {
        params[key] = 'N/A';
      }
    } else if (typeof params[key] === 'string') {
      if (key === 'LTVCACRatio') {
        params[key] = params[key].replace(/\d+\.\d+/g, (m: string) => parseFloat(m).toFixed(1));
      } else if (key === 'GrossRevenue') {
        params[key] = params[key].replace(/\d+\.\d{3,}/g, (m: string) => parseFloat(m).toFixed(2));
      } else if (key === 'MetaAdsSpend' || key === 'GoogleAdsSpend' || key === 'AOV') {
        params[key] = params[key].replace(/\.\d+/g, '');
      } else if (key === 'BlendedROAS') {
        params[key] = params[key].replace(/\d+\.\d+/g, (m: string) => parseFloat(m).toFixed(1));
      } else if (key === 'GA4Sessions' || key === 'GA4Users') {
        params[key] = params[key].replace(/\d+/g, (m: string) => parseInt(m).toLocaleString('en-IN'));
      } else if (key === 'PositiveChanges' || key === 'RequiresReviews') {
        params[key] = params[key]
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n/g, '\\n');
      } else {
        params[key] = params[key].replace(/\d+\.\d{3,}/g, (m: string) => parseFloat(m).toFixed(2));
      }
    }
  });

  const isTemp2 = templateName.startsWith('ns_temp_Notification_temp2');
  const isTemp1 = templateName.startsWith('ns_temp_Notification_temp1');

  // --- temp2: meta account aliases + metaAccounts table ---
  if (isTemp2) {
    if (params.MetaSpend == null && params.MetaAdsSpend != null) params.MetaSpend = params.MetaAdsSpend;
    if (params.Googleadsspend == null && params.GoogleAdsSpend != null) params.Googleadsspend = params.GoogleAdsSpend;

    const metaAccounts = params.metaAccounts;
    if (Array.isArray(metaAccounts) && metaAccounts.length > 0) {
      let accountsHtml = `<div style="margin-top:6px;"><div class="layer-header">META AD ACCOUNTS</div>`;
      for (const account of metaAccounts) {
        const id = account.Id || '';
        const last4 = id.slice(-4);
        const name = account.Name || 'N/A';
        const roas = account.Roas != null ? parseFloat(account.Roas).toFixed(2) : 'N/A';
        const revenue = account.Revenue != null ? `\u20B9${parseFloat(account.Revenue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
        const spend = account.Spend != null ? `\u20B9${parseFloat(account.Spend).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
        accountsHtml += `<table class="metrics-table" cellpadding="0" cellspacing="0">`;
        accountsHtml += `<tr><td colspan="3" style="padding:4px 3px 0 3px;"><div class="metric-value">${name} <span style="font-size:11px;">(XXX${last4})</span></div></td></tr>`;
        accountsHtml += `<tr>`;
        accountsHtml += `<td><div class="metric-label">Spend</div><div class="metric-value">${spend}</div></td>`;
        accountsHtml += `<td><div class="metric-label">ROAS</div><div class="metric-value">${roas}</div></td>`;
        accountsHtml += `<td><div class="metric-label">Revenue</div><div class="metric-value">${revenue}</div></td>`;
        accountsHtml += `</tr></table>`;
      }
      accountsHtml += `</div>`;
      params.metaAccountsHtml = accountsHtml;
    } else {
      params.metaAccountsHtml = '<!-- -->';
    }
    delete params.metaAccounts;
    delete params.metaAccounts_count;
  }

  // --- temp1: MetaAccountSummary + GoogleAccountSummary bullets ---
  if (isTemp1) {
    const metaAccountSummary = params.MetaAccountSummary;
    if (Array.isArray(metaAccountSummary) && metaAccountSummary.length > 0) {
      let summaryHtml = '';
      for (const line of metaAccountSummary) {
        summaryHtml += `<li><span>\u2022</span> <span>${String(line)}</span></li>`;
      }
      params.metaAccountSummaryHtml = summaryHtml;
    } else {
      params.metaAccountSummaryHtml = '<!-- -->';
    }
    delete params.MetaAccountSummary;

    const googleAccountSummary = params.GoogleAccountSummary;
    if (Array.isArray(googleAccountSummary) && googleAccountSummary.length > 0) {
      let gSummaryHtml = '';
      for (const line of googleAccountSummary) {
        gSummaryHtml += `<li><span>\u2022</span> <span>${String(line)}</span></li>`;
      }
      params.googleAccountSummaryHtml = gSummaryHtml;
    } else {
      params.googleAccountSummaryHtml = '<!-- -->';
    }
    delete params.GoogleAccountSummary;
  }

  // --- temp2: googleAccounts table ---
  if (isTemp2) {
    const googleAccounts = params.googleAccounts;
    if (Array.isArray(googleAccounts) && googleAccounts.length > 0) {
      let gAccountsHtml = `<div style="margin-top:6px;"><div class="layer-header">GOOGLE AD ACCOUNTS</div>`;
      for (const account of googleAccounts) {
        const id = account.Id || '';
        const last4 = id.slice(-4);
        const name = account.Name || 'N/A';
        const roas = account.Roas != null ? parseFloat(account.Roas).toFixed(2) : 'N/A';
        const revenue = account.Revenue != null ? `\u20B9${parseFloat(account.Revenue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
        const spend = account.Spend != null ? `\u20B9${parseFloat(account.Spend).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
        gAccountsHtml += `<table class="metrics-table" cellpadding="0" cellspacing="0">`;
        gAccountsHtml += `<tr><td colspan="3" style="padding:4px 3px 0 3px;"><div class="metric-value">${name} <span style="font-size:11px;">(XXX${last4})</span></div></td></tr>`;
        gAccountsHtml += `<tr>`;
        gAccountsHtml += `<td><div class="metric-label">ROAS</div><div class="metric-value">${roas}</div></td>`;
        gAccountsHtml += `<td><div class="metric-label">Revenue</div><div class="metric-value">${revenue}</div></td>`;
        gAccountsHtml += `<td><div class="metric-label">Spend</div><div class="metric-value">${spend}</div></td>`;
        gAccountsHtml += `</tr></table>`;
      }
      gAccountsHtml += `</div>`;
      params.googleAccountsHtml = gAccountsHtml;
    } else {
      params.googleAccountsHtml = '<!-- -->';
    }
    delete params.googleAccounts;
    delete params.googleAccounts_count;
  }

  // --- InventoryHealth (both templates) ---
  if (isTemp1 || isTemp2) {
    const inventoryHealth = params.InventoryHealth;
    if (inventoryHealth && String(inventoryHealth).trim() !== '') {
      if (isTemp1) {
        const lines = String(inventoryHealth).split(/\n/).filter((l) => l.trim());
        let ihHtml = `<h1>\uD835\uDDDC\uD835\uDDFB\uD835\uDDCF\uD835\uDDF2\uD835\uDDFB\uD835\uDE01\uD835\uDDFC\uD835\uDDFF\uD835\uDD02 \uD835\uDDDB\uD835\uDDF2\uD835\uDDEE\uD835\uDDF9\uD835\uDE01\uD835\uDDF5</h1><ul>`;
        for (const line of lines) {
          ihHtml += `<li><span>\u2022</span> <span>${line.trim()}</span></li>`;
        }
        ihHtml += `</ul>`;
        params.inventoryHealthHtml = ihHtml;
      } else {
        let ihHtml = `<div class="inventory">`;
        ihHtml += `<div class="layer-header" style="margin-bottom:5px;">INVENTORY HEALTH</div>`;
        ihHtml += `<div style="white-space:pre-line; font-size:14px;">${String(inventoryHealth)}</div>`;
        ihHtml += `</div>`;
        params.inventoryHealthHtml = ihHtml;
      }
    } else {
      params.inventoryHealthHtml = '<!-- -->';
    }
    delete params.InventoryHealth;
  }

  // --- CancelCount / RefundAmount (both templates, conditional) ---
  if (isTemp1 || isTemp2) {
    const cancelCount = params.CancelCount;
    const refundAmount = params.RefundAmount;
    if (cancelCount && String(cancelCount).trim() !== '' && refundAmount && String(refundAmount).trim() !== '') {
      if (isTemp2) {
        params.cancelRefundHtml = `<tr><td><div class="metric-label">Cancel Count</div><div class="metric-value">${String(cancelCount)}</div></td><td><div class="metric-label">Refund Amount</div><div class="metric-value">${String(refundAmount)}</div></td><td></td></tr>`;
      }
      if (isTemp1) {
        params.cancelRefundText = ` A total of ${String(cancelCount)} orders were cancelled, with a refund amount of ${String(refundAmount)}.`;
      }
    } else {
      params.cancelRefundHtml = '<!-- -->';
      params.cancelRefundText = '<!-- -->';
    }
    delete params.CancelCount;
    delete params.RefundAmount;
  }

  return params;
}
