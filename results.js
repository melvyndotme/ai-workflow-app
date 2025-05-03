// File: results.js (for results.html)

// Get references to HTML elements from results.html
const stepsDisplay = document.getElementById('steps-display');
const emailForm = document.getElementById('email-form');
const userEmailInput = document.getElementById('user-email');
const workflowIdInput = document.getElementById('workflow-id'); // The hidden input field
const sendButton = document.getElementById('send-button');
const sendingMessage = document.getElementById('sending-message');
const emailErrorMessage = document.getElementById('email-error-message');

// --- Supabase function URL is read from the constant defined in results.html's script tag ---
// const SEND_INSTRUCTIONS_FUNCTION_URL = '...'; // Defined in results.html
// ------------------------------------------------------------------------------------------

// This function runs automatically when results.html loads
function displayWorkflowSteps() {
    console.log("results.js loaded, attempting to display steps.");
    // Retrieve the data we stored in localStorage on the previous page
    const workflowId = localStorage.getItem('workflowId');
    const stepsString = localStorage.getItem('suggestedSteps');

    // Check if we actually got the data
    if (workflowId === null || stepsString === null) {
        console.error("Workflow ID or steps not found in localStorage.");
        stepsDisplay.innerHTML = '<p style="color: red;">Could not load workflow data. Please go back to the first page and submit a workflow.</p>';
        emailForm.style.display = 'none'; // Hide the email form if data is missing
        return; // Stop the function here
    }

    console.log("Found Workflow ID:", workflowId);
    console.log("Found Steps String:", stepsString);

    try {
        // Convert the JSON string back into a JavaScript array
        const steps = JSON.parse(stepsString);

        // Put the retrieved workflowId into the hidden input field in the email form.
        // This ensures we send the correct ID when the user submits their email.
        workflowIdInput.value = workflowId;

        // Create the HTML list to display the steps
        let stepsHtml = '<ul>';
        // Check if steps is actually an array and has items
        if (Array.isArray(steps) && steps.length > 0) {
             steps.forEach(step => {
                // Basic sanitization: prevent HTML injection from AI response
                // Convert step to string in case it's not already (e.g., a number)
                const sanitizedStep = String(step).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                stepsHtml += `<li>${sanitizedStep}</li>`;
            });
        } else {
            console.warn("Steps data is not an array or is empty.");
             stepsHtml += '<li>No specific steps were suggested, or there was an issue retrieving them.</li>';
        }
        stepsHtml += '</ul>';

        // Put the generated HTML into the steps-display div
        stepsDisplay.innerHTML = stepsHtml;

    } catch (error) {
        // Handle errors if the steps data wasn't valid JSON
        console.error('Error parsing steps from localStorage:', error);
        stepsDisplay.innerHTML = '<p style="color: red;">Error displaying steps. The data might be corrupted.</p>';
        emailForm.style.display = 'none'; // Hide form on error
    }
}

// Listen for when the user submits the second form (clicks "Send Me Instructions")
emailForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Stop default form submission

    // Show sending message, hide errors, disable button
    sendingMessage.style.display = 'block';
    emailErrorMessage.style.display = 'none';
    emailErrorMessage.textContent = ''; // Clear previous error
    sendButton.disabled = true;
    sendButton.textContent = 'Sending...';

    const userEmail = userEmailInput.value; // Get the email address entered
    const workflowId = workflowIdInput.value; // Get the ID from the hidden input

    try {
        // Call your deployed Supabase Edge Function 'send-instructions'
        console.log("Sending request to:", SEND_INSTRUCTIONS_FUNCTION_URL);
        const response = await fetch(SEND_INSTRUCTIONS_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'apikey': SUPABASE_ANON_KEY // Optional, defined in index.html, not results.html
            },
            // Send the email and workflow ID in the request body as JSON
            body: JSON.stringify({
                user_email: userEmail,
                workflow_id: parseInt(workflowId) // Ensure ID is an integer
            })
        });

        console.log("Received response status:", response.status);
        const responseData = await response.json(); // Read response body

        // Check if the function reported an error or success:false
        if (!response.ok || !responseData.success) {
            console.error("Function returned error:", responseData);
            throw new Error(responseData.error || `Request failed with status: ${response.status}`);
        }

        // If successful
        console.log("Successfully sent instructions:", responseData);

        // Important: Clear the stored data now that it's used,
        // so it doesn't accidentally get reused on a future visit.
        localStorage.removeItem('workflowId');
        localStorage.removeItem('suggestedSteps');

        // Redirect the user's browser to the confirmation page
        window.location.href = 'confirm.html';

    } catch (error) {
        // If anything went wrong
        console.error('Error sending instructions:', error);
        emailErrorMessage.textContent = `Error: ${error.message}`; // Show error on page
        emailErrorMessage.style.display = 'block';

        // Re-enable button and hide sending message
        sendButton.disabled = false;
        sendButton.textContent = 'Send Me Instructions';
        sendingMessage.style.display = 'none';
    }
});

// ----- IMPORTANT -----
// Run the displayWorkflowSteps function as soon as this script loads
// to populate the steps on the results page.
displayWorkflowSteps();
// ---------------------