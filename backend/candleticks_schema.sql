--
-- PostgreSQL database dump
--

\restrict DerhHXRPjAwkD0M0pIRwmxcg2bbO8XuZCFpniMXKwnVPKEiyhjC1d47e7Ei9wQC

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: normalize_daily_tf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_daily_tf() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.timeframe := '1D';
    RETURN NEW;
END;
$$;


--
-- Name: normalize_intraday_tf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_intraday_tf() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- Only normalize if it's numeric (like 1,3,5,15,30 etc.)
    IF NEW.timeframe ~ '^[0-9]+$' THEN
        NEW.timeframe := NEW.timeframe || 'm';
    END IF;

    RETURN NEW;
END;
$_$;


--
-- Name: normalize_timeframe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_timeframe() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- If daily or already correct, leave it.
    IF NEW.timeframe IN ('1D', '1W', '1M') THEN
        RETURN NEW;
    END IF;

    -- If raw numeric, convert to Xm
    IF NEW.timeframe ~ '^[0-9]+$' THEN
        NEW.timeframe := NEW.timeframe || 'm';
    END IF;

    RETURN NEW;
END;
$_$;


--
-- Name: update_modified_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: daily_candles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_candles (
    id bigint NOT NULL,
    symbol character varying(30) NOT NULL,
    exchange character varying(10) DEFAULT 'NSE'::character varying NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    open numeric(12,2) NOT NULL,
    high numeric(12,2) NOT NULL,
    low numeric(12,2) NOT NULL,
    close numeric(12,2) NOT NULL,
    volume bigint DEFAULT 0,
    timeframe character varying(10)
);


--
-- Name: daily_candles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_candles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_candles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_candles_id_seq OWNED BY public.daily_candles.id;


--
-- Name: date_ranges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.date_ranges (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    label character varying(100) NOT NULL,
    days_back_start integer NOT NULL,
    days_back_end integer NOT NULL
);


--
-- Name: date_ranges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.date_ranges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: date_ranges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.date_ranges_id_seq OWNED BY public.date_ranges.id;


--
-- Name: india_vix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.india_vix (
    trade_date date NOT NULL,
    vix numeric NOT NULL,
    open numeric,
    high numeric,
    low numeric,
    previous_close numeric,
    change_pct numeric,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: indicators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indicators (
    id integer NOT NULL,
    symbol character varying(30) NOT NULL,
    exchange character varying(10) NOT NULL,
    timeframe character varying(10) NOT NULL,
    ts timestamp without time zone NOT NULL,
    open numeric(12,4),
    high numeric(12,4),
    low numeric(12,4),
    close numeric(12,4),
    volume bigint,
    ema_9 numeric(12,4),
    ema_21 numeric(12,4),
    ema_50 numeric(12,4),
    ema_200 numeric(12,4),
    supertrend numeric(12,4),
    vwap numeric(12,4),
    rsi_14 numeric(6,2),
    macd numeric(12,4),
    macd_signal numeric(12,4),
    macd_hist numeric(12,4),
    atr_14 numeric(12,4),
    bollinger_mid numeric(12,4),
    bollinger_upper numeric(12,4),
    bollinger_lower numeric(12,4),
    true_range numeric(12,4),
    volume_sma_20 numeric(20,4),
    volume_sma_200 numeric(20,4),
    volume_ratio numeric(10,2),
    obv numeric(20,4),
    orb_high numeric(12,4),
    orb_low numeric(12,4),
    orb_breakout boolean,
    orb_breakdown boolean,
    signal character varying(10),
    signal_strength numeric(4,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    supertrend_signal character varying(10)
);


--
-- Name: indicators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.indicators_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: indicators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.indicators_id_seq OWNED BY public.indicators.id;


--
-- Name: instruments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instruments (
    instrument_key text NOT NULL,
    trading_symbol text NOT NULL,
    name text,
    exchange text NOT NULL,
    segment text NOT NULL,
    instrument_type text NOT NULL,
    isin text,
    underlying text,
    strike_price numeric(12,2),
    expiry date,
    lot_size integer,
    minimum_lot integer,
    qty_multiplier integer,
    exchange_token text,
    tick_size numeric(10,5),
    asset_class text NOT NULL,
    is_tradeable boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    last_seen_at timestamp with time zone,
    is_active boolean DEFAULT true,
    CONSTRAINT chk_equity_no_expiry CHECK (((asset_class <> 'EQUITY'::text) OR (expiry IS NULL)))
);


--
-- Name: intraday_candles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intraday_candles (
    id bigint NOT NULL,
    symbol character varying(30) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    open numeric(12,2) NOT NULL,
    high numeric(12,2) NOT NULL,
    low numeric(12,2) NOT NULL,
    close numeric(12,2) NOT NULL,
    volume bigint DEFAULT 0,
    timeframe character varying(10) NOT NULL,
    exchange character varying(10)
);


--
-- Name: intraday_candles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intraday_candles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intraday_candles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intraday_candles_id_seq OWNED BY public.intraday_candles.id;


--
-- Name: market_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_context (
    symbol text CONSTRAINT market_context_symbol_not_null1 NOT NULL,
    exchange text CONSTRAINT market_context_exchange_not_null1 NOT NULL,
    timeframe text CONSTRAINT market_context_timeframe_not_null1 NOT NULL,
    ts timestamp with time zone CONSTRAINT market_context_ts_not_null1 NOT NULL,
    vwap_dist_pct numeric,
    day_high_dist numeric,
    day_low_dist numeric,
    orb_dist_pct numeric,
    gap_pct numeric,
    minute_of_day integer,
    volume_expansion integer,
    atr_expanding integer,
    range_efficiency numeric,
    vwap_acceptance integer,
    momentum_decay integer,
    candle_overlap integer,
    market_phase text,
    context_label text,
    created_at timestamp with time zone DEFAULT now(),
    vix numeric,
    vix_change numeric,
    vix_regime text
);


--
-- Name: market_context_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_context_legacy (
    symbol text CONSTRAINT market_context_symbol_not_null NOT NULL,
    timeframe text CONSTRAINT market_context_timeframe_not_null NOT NULL,
    ts timestamp without time zone CONSTRAINT market_context_ts_not_null NOT NULL,
    orb_outcome smallint,
    ema_outcome smallint,
    atr_outcome smallint,
    orb_success_rate double precision,
    ema_success_rate double precision,
    atr_success_rate double precision,
    orb_failure_rate double precision,
    ema_failure_rate double precision,
    atr_failure_rate double precision,
    orb_chop_rate double precision,
    ema_chop_rate double precision,
    atr_chop_rate double precision,
    context_label text,
    created_at timestamp without time zone DEFAULT now(),
    exchange character varying(10) DEFAULT 'NSE'::character varying CONSTRAINT market_context_exchange_not_null NOT NULL,
    vwap_outcome smallint,
    bb_outcome smallint,
    vwap_success_rate double precision,
    bb_success_rate double precision,
    vwap_failure_rate double precision,
    bb_failure_rate double precision,
    vwap_chop_rate double precision,
    bb_chop_rate double precision,
    rule_eligibility jsonb,
    condition_snapshot jsonb,
    vwap_dist_pct double precision,
    day_high_dist double precision,
    day_low_dist double precision,
    orb_dist_pct double precision,
    gap_pct double precision,
    minute_of_day integer,
    volume_expansion smallint DEFAULT 0,
    atr_expanding smallint DEFAULT 0,
    range_efficiency numeric DEFAULT 0,
    vwap_acceptance smallint DEFAULT 0,
    momentum_decay smallint DEFAULT 0,
    candle_overlap smallint DEFAULT 0,
    market_phase character varying(24)
);


--
-- Name: ml_daywise_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_daywise_stats (
    id integer NOT NULL,
    model_run_id integer,
    trade_date date NOT NULL,
    threshold double precision NOT NULL,
    trades_taken integer,
    "precision" double precision,
    recall double precision,
    lift double precision
);


--
-- Name: ml_daywise_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ml_daywise_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ml_daywise_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ml_daywise_stats_id_seq OWNED BY public.ml_daywise_stats.id;


--
-- Name: ml_model_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_model_runs (
    id integer NOT NULL,
    symbol text NOT NULL,
    timeframe text NOT NULL,
    model_type text NOT NULL,
    trained_at timestamp with time zone NOT NULL,
    train_from timestamp with time zone,
    train_to timestamp with time zone,
    test_from timestamp with time zone,
    test_to timestamp with time zone,
    rows_used integer,
    auc double precision,
    brier double precision,
    base_win_rate double precision,
    model_path text
);


--
-- Name: ml_model_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ml_model_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ml_model_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ml_model_runs_id_seq OWNED BY public.ml_model_runs.id;


--
-- Name: rule_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_evaluations (
    symbol text NOT NULL,
    exchange text NOT NULL,
    timeframe text NOT NULL,
    ts timestamp with time zone NOT NULL,
    strategy_id text NOT NULL,
    rule_eligibility boolean,
    condition_snapshot jsonb,
    market_phase text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mv_rule_flags_1m; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_rule_flags_1m AS
 SELECT symbol,
    exchange,
    timeframe,
    ts,
    bool_or(rule_eligibility) FILTER (WHERE (strategy_id = 'EMA_TREND'::text)) AS ema_trend,
    bool_or(rule_eligibility) FILTER (WHERE (strategy_id = 'VWAP_TREND'::text)) AS vwap_trend,
    bool_or(rule_eligibility) FILTER (WHERE (strategy_id = 'ATR_EXPANSION'::text)) AS atr_expansion,
    bool_or(rule_eligibility) FILTER (WHERE (strategy_id = 'ORB'::text)) AS orb,
    bool_or(rule_eligibility) FILTER (WHERE (strategy_id = 'BB_EXPANSION'::text)) AS bb_expansion
   FROM public.rule_evaluations
  WHERE (timeframe = '1m'::text)
  GROUP BY symbol, exchange, timeframe, ts
  WITH NO DATA;


--
-- Name: paper_trade_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_trade_runs (
    id integer NOT NULL,
    model_run_id integer NOT NULL,
    symbol text,
    timeframe text,
    starting_capital double precision,
    final_capital double precision,
    threshold double precision,
    risk_pct double precision,
    rr_ratio double precision,
    total_trades integer,
    wins integer,
    losses integer,
    win_rate double precision,
    max_drawdown_pct double precision,
    expectancy double precision,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: paper_trade_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.paper_trade_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: paper_trade_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.paper_trade_runs_id_seq OWNED BY public.paper_trade_runs.id;


--
-- Name: paper_trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paper_trades (
    id integer NOT NULL,
    model_run_id integer NOT NULL,
    symbol text NOT NULL,
    timeframe text NOT NULL,
    trade_ts timestamp with time zone NOT NULL,
    trade_date date NOT NULL,
    rule_type text,
    market_phase text,
    probability double precision,
    threshold double precision,
    result text,
    pnl double precision,
    capital_after double precision,
    created_at timestamp with time zone DEFAULT now(),
    paper_trade_run_id integer,
    entry_price numeric,
    exit_price numeric,
    qty integer,
    margin_used numeric,
    exit_reason text,
    CONSTRAINT paper_trades_result_check CHECK ((result = ANY (ARRAY['WIN'::text, 'LOSS'::text])))
);


--
-- Name: paper_trades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.paper_trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: paper_trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.paper_trades_id_seq OWNED BY public.paper_trades.id;


--
-- Name: strategy_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strategy_outcomes (
    symbol text NOT NULL,
    timeframe text NOT NULL,
    ts timestamp with time zone NOT NULL,
    orb_outcome integer,
    ema_outcome integer,
    atr_outcome integer,
    vwap_outcome integer,
    bb_outcome integer,
    orb_success_rate numeric,
    ema_success_rate numeric,
    atr_success_rate numeric,
    vwap_success_rate numeric,
    bb_success_rate numeric,
    orb_failure_rate numeric,
    ema_failure_rate numeric,
    atr_failure_rate numeric,
    vwap_failure_rate numeric,
    bb_failure_rate numeric,
    orb_chop_rate numeric,
    ema_chop_rate numeric,
    atr_chop_rate numeric,
    vwap_chop_rate numeric,
    bb_chop_rate numeric,
    created_at timestamp with time zone DEFAULT now(),
    market_phase text,
    exit_reason text,
    volume_outcome smallint
);


--
-- Name: strategy_success_by_phase; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.strategy_success_by_phase AS
 SELECT symbol,
    timeframe,
    market_phase,
    avg(((orb_outcome = 1))::integer) FILTER (WHERE (orb_outcome IS NOT NULL)) AS orb_success_rate,
    avg(((orb_outcome = '-1'::integer))::integer) FILTER (WHERE (orb_outcome IS NOT NULL)) AS orb_failure_rate,
    avg(((orb_outcome = 0))::integer) FILTER (WHERE (orb_outcome IS NOT NULL)) AS orb_chop_rate,
    avg(((ema_outcome = 1))::integer) FILTER (WHERE (ema_outcome IS NOT NULL)) AS ema_success_rate,
    avg(((ema_outcome = '-1'::integer))::integer) FILTER (WHERE (ema_outcome IS NOT NULL)) AS ema_failure_rate,
    avg(((ema_outcome = 0))::integer) FILTER (WHERE (ema_outcome IS NOT NULL)) AS ema_chop_rate,
    avg(((atr_outcome = 1))::integer) FILTER (WHERE (atr_outcome IS NOT NULL)) AS atr_success_rate,
    avg(((atr_outcome = '-1'::integer))::integer) FILTER (WHERE (atr_outcome IS NOT NULL)) AS atr_failure_rate,
    avg(((atr_outcome = 0))::integer) FILTER (WHERE (atr_outcome IS NOT NULL)) AS atr_chop_rate,
    avg(((vwap_outcome = 1))::integer) FILTER (WHERE (vwap_outcome IS NOT NULL)) AS vwap_success_rate,
    avg(((vwap_outcome = '-1'::integer))::integer) FILTER (WHERE (vwap_outcome IS NOT NULL)) AS vwap_failure_rate,
    avg(((vwap_outcome = 0))::integer) FILTER (WHERE (vwap_outcome IS NOT NULL)) AS vwap_chop_rate,
    avg(((volume_outcome = 1))::integer) FILTER (WHERE (volume_outcome IS NOT NULL)) AS volume_success_rate,
    avg(((volume_outcome = '-1'::integer))::integer) FILTER (WHERE (volume_outcome IS NOT NULL)) AS volume_failure_rate,
    avg(((volume_outcome = 0))::integer) FILTER (WHERE (volume_outcome IS NOT NULL)) AS volume_chop_rate
   FROM public.strategy_outcomes
  GROUP BY symbol, timeframe, market_phase;


--
-- Name: strategy_success_rates; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.strategy_success_rates AS
 SELECT symbol,
    timeframe,
    avg(((orb_outcome = 1))::integer) AS orb_success_rate,
    avg(((orb_outcome = '-1'::integer))::integer) AS orb_failure_rate,
    avg(((orb_outcome = 0))::integer) AS orb_chop_rate,
    avg(((ema_outcome = 1))::integer) AS ema_success_rate,
    avg(((ema_outcome = '-1'::integer))::integer) AS ema_failure_rate,
    avg(((ema_outcome = 0))::integer) AS ema_chop_rate,
    avg(((atr_outcome = 1))::integer) AS atr_success_rate,
    avg(((atr_outcome = '-1'::integer))::integer) AS atr_failure_rate,
    avg(((atr_outcome = 0))::integer) AS atr_chop_rate,
    avg(((vwap_outcome = 1))::integer) AS vwap_success_rate,
    avg(((vwap_outcome = '-1'::integer))::integer) AS vwap_failure_rate,
    avg(((vwap_outcome = 0))::integer) AS vwap_chop_rate,
    avg(((bb_outcome = 1))::integer) AS bb_success_rate,
    avg(((bb_outcome = '-1'::integer))::integer) AS bb_failure_rate,
    avg(((bb_outcome = 0))::integer) AS bb_chop_rate
   FROM public.strategy_outcomes
  GROUP BY symbol, timeframe;


--
-- Name: timeframes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timeframes (
    id integer NOT NULL,
    value character varying(10) NOT NULL,
    label character varying(50) NOT NULL
);


--
-- Name: timeframes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.timeframes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: timeframes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.timeframes_id_seq OWNED BY public.timeframes.id;


--
-- Name: v_search_universe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_search_universe AS
 SELECT instrument_key,
    trading_symbol,
    name,
    exchange,
    segment,
    instrument_type,
    isin,
    underlying,
    strike_price,
    expiry,
    lot_size,
    minimum_lot,
    qty_multiplier,
    exchange_token,
    tick_size,
    asset_class,
    is_tradeable,
    created_at
   FROM public.instruments
  WHERE ((is_tradeable = true) AND ((asset_class = ANY (ARRAY['FUTURE'::text, 'OPTION'::text])) OR ((asset_class = 'EQUITY'::text) AND (expiry IS NULL) AND (trading_symbol !~ '^[0-9]'::text) AND ((instrument_type = 'EQ'::text) OR (instrument_type IS NULL)))));


--
-- Name: vix_regime; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vix_regime AS
 SELECT trade_date,
    vix,
        CASE
            WHEN (vix < (12)::numeric) THEN 'LOW_VOL'::text
            WHEN (vix < (18)::numeric) THEN 'NORMAL_VOL'::text
            ELSE 'HIGH_VOL'::text
        END AS vix_regime
   FROM public.india_vix;


--
-- Name: daily_candles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_candles ALTER COLUMN id SET DEFAULT nextval('public.daily_candles_id_seq'::regclass);


--
-- Name: date_ranges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.date_ranges ALTER COLUMN id SET DEFAULT nextval('public.date_ranges_id_seq'::regclass);


--
-- Name: indicators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicators ALTER COLUMN id SET DEFAULT nextval('public.indicators_id_seq'::regclass);


--
-- Name: intraday_candles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intraday_candles ALTER COLUMN id SET DEFAULT nextval('public.intraday_candles_id_seq'::regclass);


--
-- Name: ml_daywise_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_daywise_stats ALTER COLUMN id SET DEFAULT nextval('public.ml_daywise_stats_id_seq'::regclass);


--
-- Name: ml_model_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_runs ALTER COLUMN id SET DEFAULT nextval('public.ml_model_runs_id_seq'::regclass);


--
-- Name: paper_trade_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trade_runs ALTER COLUMN id SET DEFAULT nextval('public.paper_trade_runs_id_seq'::regclass);


--
-- Name: paper_trades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trades ALTER COLUMN id SET DEFAULT nextval('public.paper_trades_id_seq'::regclass);


--
-- Name: timeframes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeframes ALTER COLUMN id SET DEFAULT nextval('public.timeframes_id_seq'::regclass);


--
-- Name: daily_candles daily_candles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_candles
    ADD CONSTRAINT daily_candles_pkey PRIMARY KEY (id);


--
-- Name: daily_candles daily_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_candles
    ADD CONSTRAINT daily_unique UNIQUE (symbol, exchange, "timestamp");


--
-- Name: date_ranges date_ranges_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.date_ranges
    ADD CONSTRAINT date_ranges_code_key UNIQUE (code);


--
-- Name: date_ranges date_ranges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.date_ranges
    ADD CONSTRAINT date_ranges_pkey PRIMARY KEY (id);


--
-- Name: india_vix india_vix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.india_vix
    ADD CONSTRAINT india_vix_pkey PRIMARY KEY (trade_date);


--
-- Name: indicators indicators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indicators
    ADD CONSTRAINT indicators_pkey PRIMARY KEY (id);


--
-- Name: instruments instruments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instruments
    ADD CONSTRAINT instruments_pkey PRIMARY KEY (instrument_key);


--
-- Name: intraday_candles intraday_candles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intraday_candles
    ADD CONSTRAINT intraday_candles_pkey PRIMARY KEY (id);


--
-- Name: intraday_candles intraday_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intraday_candles
    ADD CONSTRAINT intraday_unique UNIQUE (symbol, exchange, "timestamp", timeframe);


--
-- Name: market_context_legacy market_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_context_legacy
    ADD CONSTRAINT market_context_pkey PRIMARY KEY (symbol, timeframe, ts);


--
-- Name: market_context market_context_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_context
    ADD CONSTRAINT market_context_pkey1 PRIMARY KEY (symbol, exchange, timeframe, ts);


--
-- Name: ml_daywise_stats ml_daywise_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_daywise_stats
    ADD CONSTRAINT ml_daywise_stats_pkey PRIMARY KEY (id);


--
-- Name: ml_model_runs ml_model_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_runs
    ADD CONSTRAINT ml_model_runs_pkey PRIMARY KEY (id);


--
-- Name: paper_trade_runs paper_trade_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trade_runs
    ADD CONSTRAINT paper_trade_runs_pkey PRIMARY KEY (id);


--
-- Name: paper_trades paper_trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trades
    ADD CONSTRAINT paper_trades_pkey PRIMARY KEY (id);


--
-- Name: rule_evaluations rule_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_evaluations
    ADD CONSTRAINT rule_evaluations_pkey PRIMARY KEY (symbol, exchange, timeframe, ts, strategy_id);


--
-- Name: strategy_outcomes strategy_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strategy_outcomes
    ADD CONSTRAINT strategy_outcomes_pkey PRIMARY KEY (symbol, timeframe, ts);


--
-- Name: timeframes timeframes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeframes
    ADD CONSTRAINT timeframes_pkey PRIMARY KEY (id);


--
-- Name: timeframes timeframes_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timeframes
    ADD CONSTRAINT timeframes_value_key UNIQUE (value);


--
-- Name: idx_candles_symbol_ts_tf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candles_symbol_ts_tf ON public.intraday_candles USING btree (symbol, "timestamp", timeframe);


--
-- Name: idx_candles_tf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_candles_tf ON public.intraday_candles USING btree (timeframe);


--
-- Name: idx_daily_symbol_tf_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_symbol_tf_ts ON public.daily_candles USING btree (symbol, timeframe, "timestamp");


--
-- Name: idx_indicators_supertrend_signal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indicators_supertrend_signal ON public.indicators USING btree (symbol, timeframe, ts, supertrend_signal);


--
-- Name: idx_indicators_symbol_tf_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_indicators_symbol_tf_ts ON public.indicators USING btree (symbol, timeframe, ts);


--
-- Name: idx_indicators_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_indicators_unique ON public.indicators USING btree (symbol, exchange, timeframe, ts);


--
-- Name: idx_instruments_asset_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruments_asset_class ON public.instruments USING btree (asset_class);


--
-- Name: idx_instruments_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruments_expiry ON public.instruments USING btree (expiry);


--
-- Name: idx_instruments_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruments_segment ON public.instruments USING btree (segment);


--
-- Name: idx_instruments_tradeable_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruments_tradeable_symbol ON public.instruments USING btree (trading_symbol) WHERE (is_tradeable = true);


--
-- Name: idx_instruments_underlying; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instruments_underlying ON public.instruments USING btree (underlying);


--
-- Name: idx_intraday_symbol_timeframe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intraday_symbol_timeframe ON public.intraday_candles USING btree (symbol, timeframe, "timestamp");


--
-- Name: idx_market_context_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_context_lookup ON public.market_context_legacy USING btree (symbol, exchange, timeframe, ts);


--
-- Name: idx_market_context_symbol_tf_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_context_symbol_tf_ts ON public.market_context USING btree (symbol, timeframe, ts);


--
-- Name: idx_mc_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_phase ON public.market_context_legacy USING btree (market_phase);


--
-- Name: idx_mc_symbol_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_symbol_ts ON public.market_context_legacy USING btree (symbol, exchange, timeframe, ts);


--
-- Name: idx_mv_rule_flags_1m; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_rule_flags_1m ON public.mv_rule_flags_1m USING btree (symbol, exchange, timeframe, ts);


--
-- Name: idx_rule_eval_symbol_tf_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_eval_symbol_tf_ts ON public.rule_evaluations USING btree (symbol, timeframe, ts);


--
-- Name: idx_search_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_name ON public.instruments USING btree (name) WHERE (is_tradeable = true);


--
-- Name: idx_search_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_symbol ON public.instruments USING btree (trading_symbol) WHERE (is_tradeable = true);


--
-- Name: idx_strategy_outcomes_symbol_tf_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_strategy_outcomes_symbol_tf_ts ON public.strategy_outcomes USING btree (symbol, timeframe, ts);


--
-- Name: idx_universe_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_universe_name_trgm ON public.instruments USING gin (name public.gin_trgm_ops);


--
-- Name: idx_universe_symbol_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_universe_symbol_trgm ON public.instruments USING gin (trading_symbol public.gin_trgm_ops);


--
-- Name: unique_candle_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_candle_index ON public.intraday_candles USING btree (symbol, exchange, "timestamp", timeframe);


--
-- Name: uq_market_context_full; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_market_context_full ON public.market_context_legacy USING btree (symbol, exchange, timeframe, ts);


--
-- Name: daily_candles trg_daily_tf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_daily_tf BEFORE INSERT ON public.daily_candles FOR EACH ROW EXECUTE FUNCTION public.normalize_daily_tf();


--
-- Name: intraday_candles trg_normalize_intraday_tf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_intraday_tf BEFORE INSERT OR UPDATE ON public.intraday_candles FOR EACH ROW EXECUTE FUNCTION public.normalize_intraday_tf();


--
-- Name: indicators trg_update_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON public.indicators FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: paper_trades fk_paper_trade_run; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trades
    ADD CONSTRAINT fk_paper_trade_run FOREIGN KEY (paper_trade_run_id) REFERENCES public.paper_trade_runs(id) ON DELETE CASCADE;


--
-- Name: ml_daywise_stats ml_daywise_stats_model_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_daywise_stats
    ADD CONSTRAINT ml_daywise_stats_model_run_id_fkey FOREIGN KEY (model_run_id) REFERENCES public.ml_model_runs(id);


--
-- Name: paper_trade_runs paper_trade_runs_model_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trade_runs
    ADD CONSTRAINT paper_trade_runs_model_run_id_fkey FOREIGN KEY (model_run_id) REFERENCES public.ml_model_runs(id);


--
-- Name: paper_trades paper_trades_model_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paper_trades
    ADD CONSTRAINT paper_trades_model_run_id_fkey FOREIGN KEY (model_run_id) REFERENCES public.ml_model_runs(id);


--
-- PostgreSQL database dump complete
--

\unrestrict DerhHXRPjAwkD0M0pIRwmxcg2bbO8XuZCFpniMXKwnVPKEiyhjC1d47e7Ei9wQC

