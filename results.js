// File: results.js (Final Version)
const stepsDisplay = document.getElementById('steps-display');
const emailForm = document.getElementById('email-form');
const userEmailInput = document.getElementById('user-email');
const workflowIdInput = document.getElementById('workflow-id'); // Hidden input
const sendButton = document.getElementById('send-button');
const sendingMessage = document.getElementById('sending-message');
const emailErrorMessage = document.getElementById('email-error-message');
const originalWorkflowTextElement = document.getElementById('original-workflow-text'); // Div for original workflow

// Constant SEND_INSTRUCTIONS_FUNCTION_URL is expected to be defined
// in results.html <script> tag before this script is loaded

// Function to display steps and original workflow when results.html loads
function displayWorkflowSteps() {
    console.log("results.js loaded, attempting to display data.");
    // Retrieve data saved by app.js from localStorage
    const workflowId = localStorage.getItem('workflowId');
    const stepsString = localStorage.getItem('suggestedSteps');
    const originalWorkflow = localStorage.getItem('originalWorkflow');

    // Display original workflow text
    if (originalWorkflowTextElement) {
        // Use textContent to prevent potential HTML injection if workflow text contained HTML
        originalWorkflowTextElement.textContent = originalWorkflow || "(Could not retrieve original workflow)";
    }

    // Check if essential data needed for the page is missing
    if (workflowId === null || stepsString === null) {
        console.error("Workflow ID or steps string not found in localStorage.");
        stepsDisplay.innerHTML = '<p style="color: #D63C3F; font-weight: bold;">Could not load workflow data. Please go back and try again.</p>';
        if(emailForm) emailForm.style.display = 'none'; // Hide email form if data is incomplete
        // Clean up potentially stale items if essential data is missing
        localStorage.removeItem('workflowId');
        localStorage.removeItem('suggestedSteps');
        localStorage.removeItem('originalWorkflow');
        return; // Stop further execution
    }

    // If data is present, populate the hidden form field
    if(workflowIdInput) workflowIdInput.value = workflowId;

    // Parse and display the suggested steps
    try {
        const steps = JSON.parse(stepsString); // Parse the JSON string back to an array
        // Use ordered list <ol> - styling handled by CSS
        let stepsHtml = '<ol style="padding-left: 0; list-style: none;">'; // Use list-style: none from CSS if preferred
        if (Array.isArray(steps) && steps.length > 0) {
             steps.forEach((step, index) => {
                // Sanitize step text before adding to HTML
                const sanitizedStep = String(step).replace(/</g, "&lt;").replace(/>/g, "&gt;");
                // Add step number visually within the list item
                stepsHtml += `<li style="margin-bottom: 10px; background-color: #f8f8f8; padding: 12px 15px; border-radius: 4px; border-left: 4px solid #D63C3F; color: #121212;"><strong style='color: #121212;'>Step ${index + 1}:</strong> ${sanitizedStep}</li>`;
            });
        } else {
             console.warn("Steps data is not an array or is empty.");
             stepsHtml += '<li>No specific steps were suggested.</li>';
        }
        stepsHtml += '</ol>';
        stepsDisplay.innerHTML = stepsHtml; // Display the formatted steps
    } catch (error) {
        // Handle error if steps data in localStorage is not valid JSON
        console.error('Error parsing steps from localStorage:', error);
        stepsDisplay.innerHTML = '<p style="color: #D63C3F; font-weight: bold;">Error displaying steps.</p>';
        if(emailForm) emailForm.style.display = 'none'; // Hide form on error
    }

    // Clean up localStorage item we no longer need on this page
    localStorage.removeItem('originalWorkflow');
    // Keep 'workflowId' and 'suggestedSteps' until email form is submitted

} // End of displayWorkflowSteps function

// Event listener for the email form submission
emailForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent default page reload

    // Update UI to show sending state
    sendingMessage.style.display = 'block';
    emailErrorMessage.style.display = 'none'; // Hide previous errors
    emailErrorMessage.textContent = ''; // Clear previous error text
    sendButton.disabled = true; // Disable button during processing
    sendButton.textContent = 'Generating & Sending...'; // Update button text

    const userEmail = userEmailInput.value; // Get email from input
    const workflowId = workflowIdInput.value; // Get ID from hidden input

    try {
        // Ensure the function URL constant exists (defined in results.html)
        if (typeof SEND_INSTRUCTIONS_FUNCTION_URL === 'undefined' || !SEND_INSTRUCTIONS_FUNCTION_URL) {
             throw new Error("Configuration error: Send function URL not set in results.html.");
        }

        console.log("Sending request to:", SEND_INSTRUCTIONS_FUNCTION_URL);
        // Call the backend function to generate/send the email
        const response = await fetch(SEND_INSTRUCTIONS_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'apikey': SUPABASE_ANON_KEY // Optional, not typically defined/needed here
            },
            body: JSON.stringify({
                user_email: userEmail,
                workflow_id: parseInt(workflowId) // Ensure ID is sent as an integer
            })
        });

        console.log("Received response status:", response.status);
        const responseData = await response.json(); // Get JSON response

        // Check if the function reported an error or success:false
        if (!response.ok || !responseData.success) {
            console.error("Function returned error:", responseData);
            throw new Error(responseData.error || `Request failed with status: ${response.status}. Check server logs.`);
        }

        // If successful
        console.log("Successfully sent instructions:", responseData);

        // Clear all related localStorage items now that the process is complete
        localStorage.removeItem('workflowId');
        localStorage.removeItem('suggestedSteps');
        localStorage.removeItem('originalWorkflow'); // Clear just in case

        // Redirect to the confirmation page
        window.location.href = 'confirm.html';

    } catch (error) {
        // Handle any errors during the fetch or processing
        console.error('Error sending instructions:', error);
        // Display user-friendly error message
        emailErrorMessage.textContent = `Error: ${error.message.includes('Failed to fetch') ? 'Network error or function unavailable.' : error.message}`;
        emailErrorMessage.style.display = 'block';

        // Restore button state
        sendButton.disabled = false;
        sendButton.textContent = 'Send Me The Custom Instructions';
        sendingMessage.style.display = 'none'; // Hide sending message
    }
});

// ----- Run displayWorkflowSteps when results.html loads -----
displayWorkflowSteps();
// -------------------------------------------------------------