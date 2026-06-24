import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResend(): Resend {
  if (!resendInstance) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY environment variable is required.");
    }
    resendInstance = new Resend(key);
  }
  return resendInstance;
}

export interface TaskItem {
  title: string;
  description?: string;
  deadline?: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "active" | "completed";
}

export async function sendHourlyReminderEmail(email: string, tasks: TaskItem[]) {
  const resend = getResend();
  
  const pendingTasks = tasks.filter(t => t.status !== "completed");
  if (pendingTasks.length === 0) {
    console.log(`[Email Service] Skipping email to ${email} as they have no pending tasks.`);
    return;
  }

  const taskRows = pendingTasks.map(task => {
    let priorityColor = "#a3a3a3"; // low (neutral-400)
    if (task.priority === "high") priorityColor = "#ef4444"; // high (red-500)
    if (task.priority === "medium") priorityColor = "#f59e0b"; // medium (amber-500)

    const formattedDeadline = task.deadline 
      ? new Date(task.deadline).toLocaleString() 
      : "No deadline specified";

    return `
      <div style="border-left: 4px solid ${priorityColor}; background-color: #171717; border-radius: 6px; padding: 16px; margin-bottom: 12px; border-top: 1px solid #262626; border-right: 1px solid #262626; border-bottom: 1px solid #262626;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <tr>
            <td style="padding: 0; vertical-align: top;">
              <h4 style="margin: 0; color: #ffffff; font-size: 16px; font-family: monospace; font-weight: bold;">
                ${task.title.toUpperCase()}
              </h4>
            </td>
            <td style="padding: 0; text-align: right; vertical-align: top; width: 80px;">
              <span style="background-color: ${priorityColor}1a; color: ${priorityColor}; font-size: 11px; padding: 2px 8px; border-radius: 12px; font-family: monospace; font-weight: bold; text-transform: uppercase; border: 1px solid ${priorityColor}33; display: inline-block;">
                ${task.priority}
              </span>
            </td>
          </tr>
        </table>
        ${task.description ? `<p style="margin: 0 0 8px 0; color: #a3a3a3; font-size: 13px; line-height: 1.5;">${task.description}</p>` : ""}
        <div style="color: #737373; font-size: 11px; font-family: monospace;">
          <span style="display: inline-block; width: 6px; height: 6px; background-color: #ef4444; border-radius: 50%; margin-right: 6px; vertical-align: middle;"></span>
          <span style="vertical-align: middle;">DEADLINE: ${formattedDeadline}</span>
        </div>
      </div>
    `;
  }).join("");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Deadline Guardian Reminder</title>
      </head>
      <body style="background-color: #0a0a0a; color: #e5e5e5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #0f0f0f; border: 1px solid #262626; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header -->
          <div style="text-align: center; border-bottom: 1px solid #262626; padding-bottom: 20px; margin-bottom: 24px;">
            <div style="display: inline-block; font-size: 24px; font-weight: bold; color: #ffffff; font-family: monospace; letter-spacing: -0.5px;">
              🛡️ DEADLINE <span style="color: #10b981;">GUARDIAN</span>
            </div>
            <p style="margin: 8px 0 0 0; color: #737373; font-size: 12px; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">
              HOURLY THREAT ASSESSMENT & TASK DIGEST
            </p>
          </div>

          <!-- Body -->
          <h2 style="color: #ffffff; font-size: 18px; margin-top: 0; margin-bottom: 12px; font-weight: 600;">
            Pending Objectives Report
          </h2>
          <p style="color: #a3a3a3; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            This is your tactical hourly briefing. Below are your active operations and approaching security deadlines that require your attention.
          </p>

          <!-- Task list -->
          <div style="margin-bottom: 24px;">
            ${taskRows}
          </div>

          <!-- Footer -->
          <div style="text-align: center; border-top: 1px solid #262626; padding-top: 20px; margin-top: 24px; color: #737373; font-size: 11px; font-family: monospace;">
            This automated alert was dispatched because of active pending tasks.
            <br>
            © ${new Date().getFullYear()} Deadline Guardian AI. Secure your commitments.
          </div>

        </div>
      </body>
    </html>
  `;

  const data = await resend.emails.send({
    from: "Deadline Guardian <onboarding@resend.dev>",
    to: [email],
    subject: `[Briefing] ${pendingTasks.length} Pending Objectives Outstanding`,
    html: htmlContent,
  });

  console.log(`[Email Service] Hourly reminder sent to ${email}. Response id:`, data.data?.id || "N/A");
  return data;
}
