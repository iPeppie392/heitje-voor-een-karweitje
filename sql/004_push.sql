-- Heitje voor een karweitje — pushmeldingen: token-kolom per gezinslid.
-- Additief, veilig opnieuw te draaien (idempotent) — raakt geen bestaande data.
-- Geen RLS-wijziging nodig: members_update (sql/003_hardening.sql) staat een update
-- van dit veld al toe zolang de rij bij hetzelfde gezin hoort en auth_user_id ofwel
-- leeg is (kinderen) ofwel van de bijwerkende ouder zelf (eigen rij) — exact hetzelfde
-- pad dat removeMember's push.updateMember(key, {archived:true}) al gebruikt voor
-- kind-rijen.
alter table members add column if not exists push_token text;
