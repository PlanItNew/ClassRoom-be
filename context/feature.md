Authentication 

Using JWT authentcation method 

Following with access token and refresh token

Create an another table with userId based primary key to store users Refersh token 

Access Token sepcification :- 
payload carries :- 
    1. userId 
    2. iat (issued at)
    3. exp 


Refresh Token sepcification :- 
payload carries :- 
    1. userId 
    2. iat (issued at)
    4. exp (expired at) 10 days 


Store refresh token in database using userId as primary key 

On login & logout
        1. Payload Need :-
            1. User name 
            2. Password 
        2. Action :- 
            1. Check username + hashed password using PASSWORD_HASH_KEY
            2. Build a refresh token for 10 days and access token of 30 mins 
            3. Store the refresh token
        3. Response :- 
            1. Return the JWT as secure cookie with httpOnly , secure , expire as 30 mins + required message 
    
    2. Logout :- 
        1. Payload needed :- 
            1. userName 
            2. JWT 
        2. Action :- 
            1. Delete the refresh token from db 
        3. Response :-
            1. Unset the cookie of JWT 

On Signup // user creation 
    1. Payload needs :- 
        1. user name 
        2. email 
        3. password 
        4. full name 
        5. role 
    2. Action :- 
        1. Hash the password 
        2. Create user in db 
    3. Response :- 
        1. Return the JWT as secure cookie with httpOnly , secure , expire as 30 mins + required message 


Create routes for user
    1. Login
    2. Signup
    3. Logout 
    

Middleware :- 
    1. Authentication:-  
        1. It checks the access token validation and if invalid it tries to refresh the token using refresh token.
        2. which will be on all exepct Login and signup as of now. 

