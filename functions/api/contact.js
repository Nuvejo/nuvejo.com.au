export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const data = await request.json();

    const { name, email, message, business, interest } = data;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const htmlContent = `
      <p><strong>Name:</strong> ${name}</p>
      ${business ? `<p><strong>Business:</strong> ${business}</p>` : ""}
      <p><strong>Email:</strong> ${email}</p>
      ${interest ? `<p><strong>Interested in:</strong> ${interest}</p>` : ""}
      <p><strong>Message:</strong><br>${message}</p>
    `;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "Nuvejo Contact Form", email: "kontakt@nuvejo.com.au" },
        to: [
          { email: "marco@nuvejo.com.au", name: "Marco" },
          { email: "ma.andriani92@gmail.com", name: "Marco" },
        ],
        replyTo: { email: email, name: name },
        subject: `New enquiry from ${name}`,
        htmlContent: htmlContent,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: "Send failed", details: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}