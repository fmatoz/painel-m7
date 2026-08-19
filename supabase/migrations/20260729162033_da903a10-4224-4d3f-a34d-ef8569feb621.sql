-- Verificar se há usuários com o e-mail gestaom7ia@gmail.com e marcá-los como confirmados
UPDATE auth.users 
SET email_confirmed_at = now(), 
    last_sign_in_at = now() 
WHERE email = 'gestaom7ia@gmail.com';