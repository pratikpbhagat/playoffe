variable "name_prefix"               { type = string }
variable "environment"               { type = string }
variable "supabase_url"              { type = string; sensitive = true }
variable "supabase_anon_key"         { type = string; sensitive = true }
variable "supabase_service_role_key" { type = string; sensitive = true }
variable "supabase_db_password"      { type = string; sensitive = true }
variable "anthropic_api_key"         { type = string; sensitive = true }
variable "instagram_app_id"          { type = string; sensitive = true }
variable "instagram_app_secret"      { type = string; sensitive = true }
variable "facebook_app_id"           { type = string; sensitive = true }
variable "facebook_app_secret"       { type = string; sensitive = true }
variable "x_api_key"                 { type = string; sensitive = true }
variable "x_api_secret"              { type = string; sensitive = true }
variable "x_access_token"            { type = string; sensitive = true }
variable "x_access_token_secret"     { type = string; sensitive = true }
