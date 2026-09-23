# Source brief

## 2026-09-23 — BRD v1.0

Received: 2026-09-23 (file dated 2026-09-22), from the client (sender not
recorded), via document — `AI_Travel_Planner_BRD.pdf`.

Source file: `.brain/docs/ref/001-AI_Travel_Planner_BRD.pdf`

Transcribed verbatim below, section by section. Wording, capitalisation and
punctuation are the client's.

> **Business Requirements Document — AI Travel Planner**
>
> AI-powered travel planning, conversational assistance, email communication and customer feedback
>
> | | |
> |---|---|
> | Document Version | 1.0 |
> | Document Type | Business Requirements Document (BRD) |
> | Project Type | Web Application / SDLC Demonstration |
> | Primary Users | Travelers, Administrators, Travel Consultants |
> | Core Capabilities | AI Planner, AI Chat, Email, Itinerary Management, Feedback |
>
> **1. Business Objective**
>
> The objective is to develop an AI-powered Travel Planner that allows users to describe their travel requirements and receive a personalized, editable itinerary.
>
> The application will combine a structured trip-planning form, an AI planner, a conversational chat box, email communication, itinerary management, and customer feedback.
>
> The product is intentionally designed to support an evolving SDLC demonstration where requirements can change after customer reviews and each change can be implemented and released as a new iteration.
>
> **2. Business Problem**
>
> Travel planning normally requires users to research destinations, activities, restaurants, accommodation, transportation and costs across multiple sources.
>
> The proposed system provides a single application where users can enter their preferences, generate an initial travel plan, discuss changes with an AI assistant, save the result, and receive the itinerary by email.
>
> **3. Project Goals**
>
> Provide a simple and engaging travel-planning experience.
> Use AI to generate and personalize itineraries.
> Provide a conversational chat interface for refining an itinerary.
> Allow users to save, edit, regenerate and share plans.
> Send itinerary and notification emails.
> Capture customer feedback and use it as input for future product iterations.
> Provide an administrator view for managing users, destinations, feedback and application metrics.
>
> **4. Target Users**
>
> Traveler: creates trips, interacts with the AI planner, manages itineraries and provides feedback.
> Administrator: manages users, destinations, feedback, content and system-level reporting.
> Travel Consultant (optional): reviews or enhances AI-generated plans for customers.
>
> **5. Core User Journey**
>
> Register/Login → Create Trip → Enter Requirements → Generate AI Plan → Review Itinerary → Chat with AI → Modify/Regenerate → Save Trip → Email/Share → Travel → Provide Feedback.
>
> **6. Trip Creation**
>
> Users can create a trip by entering trip name, destination, start date, end date, number of travelers, adults, children, budget and currency.
>
> Example: Tokyo Family Holiday, Tokyo, 10–17 October 2026, 4 travelers, USD 5,000.
>
> **7. Travel Preferences**
>
> Travel style: Relaxed, Balanced, Adventure, Luxury, Budget, Family, Business or Cultural.
>
> Interests: History, Nature, Shopping, Food, Museums, Beaches, Nightlife, Photography, Adventure, Sports, Local Culture and Architecture.
>
> Food preferences: No Preference, Vegetarian, Vegan, Halal, Gluten-Free or Other.
>
> Transportation: Public Transport, Taxi, Rental Car, Walking or Mixed.
>
> **8. AI Travel Planner**
>
> The AI Planner is the primary intelligence feature. It receives structured trip requirements and generates a day-by-day itinerary.
>
> AI output should include suggested activities, times, durations, estimated costs, locations and reasons for recommendations.
>
> The generated plan should be editable rather than treated as a fixed result.
>
> **9. AI Chat Box / Conversational Assistant**
>
> The application must provide a chat box associated with the current trip.
>
> Users can ask natural-language questions or request changes such as: "Make Day 2 less busy", "Remove shopping", "Replace museums with outdoor activities", or "Make this suitable for children."
>
> The AI should use the current itinerary and trip preferences as context.
>
> Changes should be previewed or clearly reflected in the itinerary so the user can review them before relying on the updated plan.
>
> **10. AI Itinerary Regeneration**
>
> Users should be able to regenerate a complete itinerary or a specific day/section.
>
> Small changes should not require unnecessary regeneration of unrelated parts of the trip.
>
> The system should retain the user's selected preferences when regenerating.
>
> **11. Budget Estimation**
>
> The system should estimate costs for accommodation, food, transportation, activities, shopping and other expenses.
>
> It should show estimated total cost versus the user's budget.
>
> Users may ask the AI to reduce the estimated cost or suggest lower-cost alternatives.
>
> **12. Accommodation and Activity Preferences**
>
> Users can specify accommodation type, budget range, preferred location, rating and facilities.
>
> Activities should support view, edit, remove, replace and move-to-another-day operations.
>
> **13. Saved Trips**
>
> Users can save generated trips and reopen them later.
>
> Users can edit, regenerate, delete and share saved itineraries.
>
> **14. Email Communication**
>
> Email is a core feature for the demo.
>
> After itinerary generation, the user can receive an itinerary email.
>
> Users can receive notifications when a significant itinerary change is made.
>
> The system can send trip reminders before the travel date.
>
> Users can share an itinerary by entering another recipient's email address.
>
> Example email events: Trip Created, Itinerary Updated, Trip Reminder and Itinerary Shared.
>
> **15. Customer Feedback**
>
> Users should be able to rate the generated itinerary and provide comments.
>
> Feedback should be stored against the relevant trip/itinerary.
>
> Administrators should be able to review feedback and identify recurring requirements.
>
> **16. AI Feedback Analysis**
>
> AI may summarize customer feedback and identify recurring themes.
>
> Example themes: schedules are too busy, recommendations are too expensive, insufficient family activities, or insufficient transportation information.
>
> This feature can be introduced as a later SDLC iteration.
>
> **17. User Account Management**
>
> Users can register, log in, log out and update their profile.
>
> Profile preferences may include preferred currency, default travel style and dietary preference.
>
> **18. Admin Dashboard**
>
> Dashboard metrics may include total users, total trips, generated itineraries, popular destinations, average budget, feedback volume and AI usage.
>
> Administrators can manage users, destinations and feedback.
>
> **19. Destination Management**
>
> Administrators can add, edit, disable or remove destinations.
>
> Destination information can include description, popular activities, recommended duration and travel information.
>
> **20. Search and Filtering**
>
> Users can search saved trips and destinations.
>
> Filters may include destination, country, city, budget, travel style and trip duration.
>
> **21. Notifications**
>
> The system should provide in-app feedback for successful or failed operations.
>
> Email notifications should be configurable for key events.
>
> AI-generated information should be clearly identified as recommendations rather than confirmed bookings.
>
> **22. Non-Functional Requirements**
>
> Security: protect accounts, passwords, APIs and personal information.
>
> Performance: normal application pages should respond within an acceptable time under expected usage.
>
> Reliability: saved trips must persist across application restarts.
>
> Maintainability: separate UI, business logic, database, AI integration and email services.
>
> Scalability: architecture should allow additional AI features and users later.
>
> **23. Suggested High-Level Architecture**
>
> Browser/UI → Web API → Business Services → Database.
>
> AI Service integrates with the application through a dedicated service layer.
>
> Email Service handles transactional and notification emails.
>
> Separating AI and email integrations makes future provider changes easier.
>
> **24. Key Functional Modules**
>
> Authentication & User Management
> Trip Management
> Travel Preference Management
> AI Planner
> AI Chat Box
> Itinerary Management
> Budget Estimation
> Email Notification Service
> Feedback Management
> AI Feedback Analysis
> Destination Management
> Admin Dashboard
>
> **25. SDLC Demonstration Roadmap**
>
> Release 1 – MVP: login, create trip, destination, dates, budget, basic itinerary and save trip.
> Customer Feedback: "The itinerary is too generic."
> Release 2: interests, travel style, dietary requirements and AI personalization.
> Customer Feedback: "I want to change the itinerary by chatting instead of editing everything manually."
> Release 3: AI chat box and conversational itinerary modification.
> Customer Feedback: "I need to know whether the plan fits my budget."
> Release 4: cost estimation and AI budget optimization.
> Customer Feedback: "Send the final itinerary to my email."
> Release 5: itinerary email, sharing and reminders.
> Customer Feedback: "Management needs to understand what customers are asking for."
> Release 6: feedback dashboard and AI feedback analysis.
>
> **26. Example Customer Change Requests**
>
> "Can you make the trip more suitable for children?"
> "Can you reduce the number of activities per day?"
> "Replace expensive restaurants with budget options."
> "Send the final itinerary to my email."
> "Can I ask the AI questions about my trip?"
> "Show me why the AI recommended this activity."
> "Can management see the most common customer complaints?"
>
> **27. Demo Acceptance Criteria**
>
> The user can create an account and create a trip.
> The user can enter destination, dates, travelers, budget and preferences.
> The AI can generate a structured itinerary.
> The user can interact with the itinerary through a chat box.
> The AI can make requested changes while retaining trip context.
> The user can save and reopen a trip.
> The user can receive the itinerary through email.
> The user can submit feedback.
> The administrator can view trips and feedback.
> The demo can show at least two requirement changes resulting from customer feedback.
>
> **28. Future Enhancements**
>
> Live weather integration.
> Real-time flight and hotel information.
> Map integration.
> Calendar integration.
> Multi-language itinerary generation.
> Voice-based AI travel assistant.
> Mobile application.
> AI-based travel risk and disruption notifications.
> Integration with booking providers.
>
> **29. Important AI Considerations**
>
> AI-generated recommendations should be presented as recommendations and not as guaranteed availability, prices or bookings.
>
> Users should be able to review AI-generated changes.
>
> Sensitive personal information should not be unnecessarily included in AI prompts.
>
> AI failures should have a clear fallback message rather than blocking the entire application.
>
> AI prompts and outputs should be logged only according to the application's privacy and retention requirements.
>
> **30. High-Level Requirements Matrix**
>
> | ID | Requirement | Priority |
> |---|---|---|
> | FR-01 | User registration and login | High |
> | FR-02 | Create and manage trips | High |
> | FR-03 | Enter travel preferences | High |
> | FR-04 | AI itinerary generation | High |
> | FR-05 | AI conversational chat box | High |
> | FR-06 | Modify/regenerate itinerary | High |
> | FR-07 | Budget estimation | Medium |
> | FR-08 | Save and reopen trips | High |
> | FR-09 | Email itinerary and notifications | High |
> | FR-10 | Customer feedback | Medium |
> | FR-11 | Admin dashboard | Medium |
> | FR-12 | AI feedback analysis | Future/Medium |
>
> End of Business Requirements Document

Nothing else was said.

A second file, `.brain/docs/AI_Travel_Planner_BRD_Demo_7Days.pdf`, sits beside
this one. It was not supplied with this `/decompose` and is not part of this
brief.
