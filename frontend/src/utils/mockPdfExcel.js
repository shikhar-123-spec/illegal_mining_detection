/**
 * Client-side report exports for PDF and Excel (CSV)
 * Fulfills FR-15: PDF and Excel download capability
 */

export const exportToCSV = (reportData, filename = "surveillance_report") => {
    if (!reportData || reportData.length === 0) return;

    // Headers
    const headers = ["ID", "Region", "Activity Type", "Severity", "Confidence Score", "GPS Coordinates", "Status", "Date Flagged"];
    
    // Rows
    const rows = reportData.map(item => [
        item.id,
        item.region,
        item.type,
        item.severity,
        item.confidence,
        item.coordinates.replace(",", ";"), // Avoid CSV collision
        item.status,
        item.date
    ]);

    // Build CSV string
    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
};

export const exportToPDF = (reportData, regionName = "All Regions") => {
    if (!reportData || reportData.length === 0) return;

    // Create a new window for printing to get a clean layout
    const printWindow = window.open("", "_blank", "width=900,height=700");
    
    const rowsHtml = reportData.map(item => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; font-weight: bold;">#AL-${item.id}</td>
            <td style="padding: 10px;">${item.region}</td>
            <td style="padding: 10px; text-transform: capitalize;">${item.type}</td>
            <td style="padding: 10px;"><span style="
                padding: 4px 8px; 
                border-radius: 4px; 
                font-size: 0.75rem; 
                font-weight: bold;
                background-color: ${item.severity === "HIGH" ? "#fee2e2" : "#fef3c7"};
                color: ${item.severity === "HIGH" ? "#b91c1c" : "#b45309"};
            ">${item.severity}</span></td>
            <td style="padding: 10px;">${item.confidence}</td>
            <td style="padding: 10px; font-family: monospace;">${item.coordinates}</td>
            <td style="padding: 10px; font-weight: bold; color: ${item.status === "CONFIRMED" ? "#dc2626" : item.status === "PENDING" ? "#d97706" : "#059669"}">${item.status}</td>
            <td style="padding: 10px; color: #666;">${item.date}</td>
        </tr>
    `).join("");

    printWindow.document.write(`
        <html>
        <head>
            <title>Surveillance Report - ${regionName}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; }
                .header { display: flex; justify-content: space-between; border-bottom: 3px solid #059669; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 24px; font-weight: bold; color: #111; }
                .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
                .meta { text-align: right; font-size: 13px; color: #555; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background-color: #f3f4f6; color: #374151; font-weight: bold; text-align: left; padding: 12px 10px; font-size: 14px; }
                .footer { border-top: 1px solid #ddd; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #777; text-align: center; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="title">Illegal Mining & Deforestation Detection System</div>
                    <div class="subtitle">Official Survelliance Alert & Analysis Log Report</div>
                </div>
                <div class="meta">
                    <div><strong>Target:</strong> ${regionName}</div>
                    <div><strong>Export Date:</strong> ${new Date().toLocaleString()}</div>
                    <div><strong>Security Status:</strong> Restricted/Government-Use</div>
                </div>
            </div>
            
            <h3 style="margin-bottom: 10px; color: #111;">Active Incident Escalation List</h3>
            <table>
                <thead>
                    <tr>
                        <th>Alert ID</th>
                        <th>Region of Interest</th>
                        <th>Incident Type</th>
                        <th>Severity</th>
                        <th>AI Confidence</th>
                        <th>GPS Bounding Coordinates</th>
                        <th>Audit Status</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                <p>This report was generated dynamically by an authorized system user via the GIS Surveillance Dashboard.</p>
                <p>&copy; ${new Date().getFullYear()} Forest Department & Environmental Surveillance Platform. All Rights Reserved.</p>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
