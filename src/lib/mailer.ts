import { Resend } from "resend"
import { createClient, type User } from "@supabase/supabase-js"
import Handlebars from "handlebars"
import type { TemplateDelegate } from "handlebars"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { Database } from "../DatabaseDefinitions"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Type aliases for clarity
type Profile = Database["public"]["Tables"]["profiles"]["Row"]

// Email template types
interface EmailTemplate {
  subject: string
  html?: string
  text?: string
}

interface EmailTemplateContext {
  name: string
  [key: string]: unknown
}

// User retrieval function
async function getUserDetails(userId: string): Promise<Profile | null> {
  const supabase = createClient<Database>(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PRIVATE_SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .limit(1)

  if (error) {
    console.error("Error fetching user details:", error)
    return null
  }

  return data && data.length > 0 ? data[0] : null
}

// Template loading and compilation
function loadEmailTemplate(templateName: string): {
  html: TemplateDelegate
  text: TemplateDelegate
} {
  const templateDir = join(__dirname, "emails")

  const htmlTemplate = Handlebars.compile(
    readFileSync(join(templateDir, `${templateName}_html.hbs`), "utf-8"),
  )
  const textTemplate = Handlebars.compile(
    readFileSync(join(templateDir, `${templateName}_text.hbs`), "utf-8"),
  )

  return { html: htmlTemplate, text: textTemplate }
}

// Welcome email specific function
export async function sendWelcomeEmail(user: User): Promise<void> {
  const profile = await getUserDetails(user.id)
  if (!profile || !profile.full_name) {
    console.log("User profile not found or incomplete")
    return
  }

  const templates = loadEmailTemplate("welcome_email")
  const context: EmailTemplateContext = {
    name: profile.full_name,
  }

  const emailData: EmailTemplate = {
    subject: "Welcome to AptlySaid!",
    html: templates.html(context),
    text: templates.text(context),
  }

  await sendEmail(
    user.email!,
    emailData.subject,
    emailData.text,
    emailData.html,
  )
}

// Contact form email function
export async function sendContactFormEmail(
  formData: {
    name: string
    email: string
    phone?: string
    message: string
  },
  adminEmail: string,
): Promise<void> {
  const subject = `New Contact Form Submission from ${formData.name}`
  const text = `
New contact form submission:

Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone || "Not provided"}

Message:
${formData.message}
  `.trim()

  const html = `
<h2>New contact form submission</h2>
<p><strong>Name:</strong> ${formData.name}</p>
<p><strong>Email:</strong> ${formData.email}</p>
<p><strong>Phone:</strong> ${formData.phone || "Not provided"}</p>
<h3>Message:</h3>
<p>${formData.message.replace(/\n/g, "<br>")}</p>
  `.trim()

  await sendEmail(adminEmail, subject, text, html, formData.email)
}

// Generic email sending function
export async function sendEmail(
  to: string | string[],
  subject: string,
  plaintextBody?: string,
  htmlBody?: string,
  from?: string,
): Promise<void> {
  if (!process.env.PRIVATE_RESEND_API_KEY) {
    console.log(
      "WARN: PRIVATE_RESEND_API_KEY not set, skipping email send to",
      to,
    )
    return
  }

  const to_emails = Array.isArray(to) ? to : [to]
  const from_email =
    from || process.env.PRIVATE_FROM_ADMIN_EMAIL || "admin@localhost"

  console.log(
    `Sending email | To: ${to_emails.join(", ")} | Subject: ${subject}`,
  )

  try {
    const email: {
      from: string
      to: string[]
      subject: string
      text?: string
      html?: string
    } = {
      from: from_email,
      to: to_emails,
      subject: subject,
    }

    if (plaintextBody) {
      email.text = plaintextBody
    }
    if (htmlBody) {
      email.html = htmlBody
    }

    const resend = new Resend(process.env.PRIVATE_RESEND_API_KEY)
    const resp = await resend.emails.send(
      email as unknown as Parameters<typeof resend.emails.send>[0],
    )

    if (resp.error) {
      console.log("Failed to send email, error:", resp.error)
    }
  } catch (e) {
    console.log("Failed to send email, error:", e)
  }
}
