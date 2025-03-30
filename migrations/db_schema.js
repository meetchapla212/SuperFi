const SCHEMA = `

CREATE TABLE IF NOT EXISTS admin_master (
    admin_id SERIAL PRIMARY KEY,
    admin_name VARCHAR (50),
    u_email_id VARCHAR (255),
    u_password VARCHAR (255),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    role VARCHAR (25) DEFAULT 'admin',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users_master (
    user_id UUID PRIMARY KEY,
    first_name VARCHAR (50),
    last_name VARCHAR (50),
    u_email_id VARCHAR (255),
    u_password VARCHAR (255),
    date_of_birth VARCHAR (25),
    user_preference_setting JSONB not null default '{}'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_email_verified INT DEFAULT 0,
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_notification_token_master (
    notification_token_id SERIAL PRIMARY KEY,
    _user_id UUID,
    device_id VARCHAR (255),
    device_type VARCHAR (25),
    device_token TEXT,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_onboarding_progress_master (
    user_onboarding_id SERIAL PRIMARY KEY,
    email_id VARCHAR (255),
    user_progress JSONB not null default '{}'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR (255),
    setting_value VARCHAR (255),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS verification_email_master (
    verification_id SERIAL PRIMARY KEY,
    email_id VARCHAR (255),
    secret_token TEXT,
    is_verified INT DEFAULT 0,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bank_master (
    bank_id SERIAL PRIMARY KEY,
    provider_id VARCHAR (100),
    bank_name VARCHAR (100),
    country VARCHAR (30),
    logo_url VARCHAR (50),
    scopes TEXT,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_bank_account_master (
    user_bank_account_id SERIAL PRIMARY KEY,
    _bank_id INT,
    _user_id UUID,
    refresh_token TEXT,
    next_refresh_token_time VARCHAR (25),
    is_token_expired INT DEFAULT 0,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_brand_master (
    card_brand_id SERIAL PRIMARY KEY,
    brand_name VARCHAR (100),
    brand_sku_code VARCHAR (25),
    brand_image VARCHAR (255),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_brand_type_master (
    card_type_id SERIAL PRIMARY KEY,
    _card_brand_id INT,
    card_type_name VARCHAR (255),
    interest_rate DECIMAL(11,2),
    card_type_image VARCHAR (255),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_card_master (
    user_card_id SERIAL PRIMARY KEY,
    _user_id UUID,
    _bank_id INT,
    _card_type_id INT,
    truelayer_card_id VARCHAR(255),
    custom_brand_type_name VARCHAR(255),
    custom_interest_rate NUMERIC(11,2),
    card_details JSONB not null default '{}'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS overdraft_catalog_master (
    overdraft_catalog_id SERIAL PRIMARY KEY,
    _bank_id INT,
    interest_rate DECIMAL(11,2),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_card_master (
    user_card_id SERIAL PRIMARY KEY,
    _user_id UUID,
    _bank_id INT,
    _card_type_id INT,
    truelayer_card_id VARCHAR(255),
    custom_brand_type_name VARCHAR(255),
    custom_interest_rate NUMERIC(11,2),
    card_details JSONB not null default '{}'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_overdraft_account_master (
    user_overdraft_account_id SERIAL PRIMARY KEY,
    _user_id UUID,
    _bank_id INT,
    truelayer_account_id VARCHAR(50),
    account_details JSONB not null default '{}'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bnpl_provider_master (
    bnpl_id SERIAL PRIMARY KEY,
    interest_rate NUMERIC(11,2),
    fix_amount NUMERIC(11,2),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_klarna_account_master (
    klarna_id SERIAL PRIMARY KEY,
    _user_id UUID,
    _bnpl_id INT,
    klarna_account_id VARCHAR(100) DEFAULT NULL,
    price_of_purchase NUMERIC(11,2),
    remaining_balance NUMERIC(11,2),
    interest_free_period INT,
    payment_schedule VARCHAR (50),
    repayment_plan_left_months INT,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users_login_history (
    user_login_history_id SERIAL PRIMARY KEY,
    _user_id UUID,
    ip_address VARCHAR (25),
    logged_in_at VARCHAR (25),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reward_task_master (
    reward_task_id SERIAL PRIMARY KEY,
    task_name VARCHAR (255),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_active INT DEFAULT 0,
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_reward_master (
    user_overdraft_account_id SERIAL PRIMARY KEY,
    _user_id UUID,
    month_name VARCHAR (25),
    reward_info JSONB not null default '[]'::jsonb,
    is_completed INT DEFAULT 0,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    status VARCHAR (25) DEFAULT 'active',
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_repayment_master (
    user_repayment_id SERIAL PRIMARY KEY,
    _user_id UUID,
    platform_card_account_id VARCHAR (50), 
    account_type VARCHAR (25),
    month_name VARCHAR (25),
    paid_amount NUMERIC (11,2),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_klarna_transaction (
    user_transaction_id SERIAL PRIMARY KEY,
    _user_id UUID,
    platform_card_account_id VARCHAR (50), 
    card_account_id INT,
    account_type VARCHAR (25),
    start_date VARCHAR (25),
    end_date VARCHAR (25),
    transaction_details JSONB not null default '[]'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS loan_bank_master (
    loan_bank_id SERIAL PRIMARY KEY,
    provider_id VARCHAR (100),
    bank_name VARCHAR (100),
    country VARCHAR (30),
    logo_url VARCHAR (50),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_loan_transaction (
    user_loan_transaction_id SERIAL PRIMARY KEY,
    _user_id UUID,
    platform_card_account_id VARCHAR (50), 
    card_account_id INT,
    loan_provider_name VARCHAR (25),
    account_type VARCHAR (25) default 'overdraft',
    start_date VARCHAR (25),
    end_date VARCHAR (25),
    transaction_details JSONB not null default '[]'::jsonb,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users_screen_last_visit (
    user_screen_last_visit_id SERIAL PRIMARY KEY,
    _user_id UUID,
    debt_calculator_last_visit_date VARCHAR (25),
    credit_score_last_visit_date VARCHAR (25),
    cashback_last_visit_date VARCHAR (25),
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_reward_cashback_account (
    user_reward_cashback_account_id SERIAL PRIMARY KEY,
    _user_id UUID,
    user_overdraft_account_id INT,
    date_created VARCHAR (25),
    date_modified VARCHAR (25),
    is_deleted INT DEFAULT 0
);
`;

// INSERT INTO app_settings (setting_key, setting_value) VALUES ('new_register_allow', '1');

// INSERT INTO card_brand_master (brand_name, brand_sku_code, brand_image) VALUES ('Mock', 'mock', 'default_card.png');
// INSERT INTO card_brand_type_master (_card_brand_id, card_type_name, interest_rate, card_type_image) VALUES ('1', 'Mock Gold', 'default_card.png');

// INSERT INTO admin_master (admin_name, u_email_id, u_password) VALUES ('Admin', 'superfiadmin@yopmail.com', 'cc0f00e75186aa66709cdaf524701663ebc358eaffc405b83508d6e14827850d');

// ALTER TABLE users_master ADD COLUMN last_login_date VARCHAR (25);
// ALTER TABLE users_master ADD COLUMN last_login_ip VARCHAR (255);
// ALTER TABLE users_master ADD COLUMN user_unique_id SERIAL;
// ALTER TABLE users_master ADD COLUMN device_name VARCHAR(25);
// ALTER TABLE users_master ADD COLUMN superfi_rating VARCHAR(25);
// ALTER TABLE users_master ADD COLUMN is_completed INT DEFAULT 0;
// ALTER TABLE user_klarna_account_master ADD COLUMN payment_installments_details jsonb;
// ALTER TABLE user_klarna_account_master ADD COLUMN date_of_purchase varchar(25);

// INSERT INTO app_settings (setting_key, setting_value) VALUES ('cashback_reward_total_amount', 250);

// ALTER TABLE user_repayment_master ADD status VARCHAR(25) default 'active';
// ALTER TABLE reward_task_master ADD status VARCHAR (50);
// ALTER TABLE user_reward_master ADD win_reward_amount NUMERIC(10,2), ADD reward_credit_date VARCHAR(25);
// ALTER TABLE users_master ADD COLUMN address varchar(255);
// ALTER TABLE user_repayment_master ADD COLUMN bnpl_platform_id int4;
// ALTER TABLE user_bank_account_master ADD consent_expires_at VARCHAR(25);
// ALTER TABLE user_repayment_master ADD _user_card_account_id INT;
