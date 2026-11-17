--
-- PostgreSQL database dump
--

\restrict Usq6lE8G5Pf8Bccbj6N3p3EbdfpiA5x6qbdypUpHcniR9nDOaWbLnQ4pQ3HC1Jn

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-11-11 18:51:42

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 233 (class 1259 OID 16516)
-- Name: categorias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categorias (
    id_categoria integer NOT NULL,
    nombre_categoria character varying(20) NOT NULL
);


ALTER TABLE public.categorias OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 16515)
-- Name: categorias_id_categoria_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categorias_id_categoria_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categorias_id_categoria_seq OWNER TO postgres;

--
-- TOC entry 5275 (class 0 OID 0)
-- Dependencies: 232
-- Name: categorias_id_categoria_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categorias_id_categoria_seq OWNED BY public.categorias.id_categoria;


--
-- TOC entry 246 (class 1259 OID 16701)
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clientes (
    numero_documento character varying(15) NOT NULL,
    tipo_documento character varying(5) NOT NULL,
    nombre_cliente character varying(100) NOT NULL,
    telefono character varying(15),
    correo character varying(100),
    direccion character varying(120),
    estado boolean DEFAULT true NOT NULL,
    departamento character varying(15),
    municipio character varying(25),
    CONSTRAINT ck_clientes_correo CHECK (((correo IS NULL) OR ((correo)::text ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'::text))),
    CONSTRAINT ck_clientes_tipo CHECK (((tipo_documento)::text = ANY ((ARRAY['CC'::character varying, 'CE'::character varying, 'NIT'::character varying, 'PAS'::character varying])::text[])))
);


ALTER TABLE public.clientes OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 16563)
-- Name: compras; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compras (
    id_compra integer NOT NULL,
    id_proveedor integer NOT NULL,
    id_usuario integer NOT NULL,
    fecha_compra timestamp without time zone DEFAULT now() NOT NULL,
    iva numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total_compra numeric(12,2) DEFAULT 0 NOT NULL,
    observaciones character varying(200),
    estado boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_compras_valores CHECK (((iva >= (0)::numeric) AND (descuento >= (0)::numeric) AND (total_compra >= (0)::numeric)))
);


ALTER TABLE public.compras OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 16562)
-- Name: compras_id_compra_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.compras_id_compra_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.compras_id_compra_seq OWNER TO postgres;

--
-- TOC entry 5276 (class 0 OID 0)
-- Dependencies: 236
-- Name: compras_id_compra_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.compras_id_compra_seq OWNED BY public.compras.id_compra;


--
-- TOC entry 239 (class 1259 OID 16594)
-- Name: detalle_compra; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detalle_compra (
    id_detalle_compra integer NOT NULL,
    id_compra integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad numeric(12,2) NOT NULL,
    unidad_medida character varying(15) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    CONSTRAINT ck_detalle_compra_cantidad CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT ck_detalle_compra_precio CHECK ((precio_unitario >= (0)::numeric))
);


ALTER TABLE public.detalle_compra OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 16593)
-- Name: detalle_compra_id_detalle_compra_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.detalle_compra_id_detalle_compra_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detalle_compra_id_detalle_compra_seq OWNER TO postgres;

--
-- TOC entry 5277 (class 0 OID 0)
-- Dependencies: 238
-- Name: detalle_compra_id_detalle_compra_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.detalle_compra_id_detalle_compra_seq OWNED BY public.detalle_compra.id_detalle_compra;


--
-- TOC entry 245 (class 1259 OID 16678)
-- Name: detalle_produccion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detalle_produccion (
    id_detalle_produccion integer NOT NULL,
    id_produccion integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad_obtenida numeric(12,2) NOT NULL,
    unidad_medida character varying(15),
    CONSTRAINT ck_detalle_produccion_cantidad CHECK ((cantidad_obtenida > (0)::numeric))
);


ALTER TABLE public.detalle_produccion OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 16677)
-- Name: detalle_produccion_id_detalle_produccion_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.detalle_produccion_id_detalle_produccion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detalle_produccion_id_detalle_produccion_seq OWNER TO postgres;

--
-- TOC entry 5278 (class 0 OID 0)
-- Dependencies: 244
-- Name: detalle_produccion_id_detalle_produccion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.detalle_produccion_id_detalle_produccion_seq OWNED BY public.detalle_produccion.id_detalle_produccion;


--
-- TOC entry 250 (class 1259 OID 16752)
-- Name: detalle_venta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detalle_venta (
    id_detalle_venta integer NOT NULL,
    id_venta integer NOT NULL,
    id_producto integer NOT NULL,
    id_lote integer,
    cantidad numeric(12,2) NOT NULL,
    unidad_medida character varying(15) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    CONSTRAINT ck_detalle_venta_cantidad CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT ck_detalle_venta_precio CHECK ((precio_unitario >= (0)::numeric))
);


ALTER TABLE public.detalle_venta OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 16751)
-- Name: detalle_venta_id_detalle_venta_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.detalle_venta_id_detalle_venta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.detalle_venta_id_detalle_venta_seq OWNER TO postgres;

--
-- TOC entry 5279 (class 0 OID 0)
-- Dependencies: 249
-- Name: detalle_venta_id_detalle_venta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.detalle_venta_id_detalle_venta_seq OWNED BY public.detalle_venta.id_detalle_venta;


--
-- TOC entry 241 (class 1259 OID 16619)
-- Name: lotes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lotes (
    id_lote integer NOT NULL,
    id_detalle_compra integer NOT NULL,
    numero_lote character varying(20) NOT NULL,
    fecha_ingreso date DEFAULT CURRENT_DATE NOT NULL,
    fecha_vencimiento date NOT NULL,
    tipo_empaque character varying(10) NOT NULL,
    cantidad_disponible numeric(12,2) DEFAULT 0 NOT NULL,
    zona_ubicacion character varying(40),
    es_transformable boolean DEFAULT true NOT NULL,
    estado boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_lotes_disponible CHECK ((cantidad_disponible >= (0)::numeric)),
    CONSTRAINT ck_lotes_empaque CHECK (((tipo_empaque)::text = ANY ((ARRAY['Bulto'::character varying, 'Caja'::character varying, 'Bolsa'::character varying])::text[]))),
    CONSTRAINT ck_lotes_fechas CHECK ((fecha_vencimiento >= fecha_ingreso))
);


ALTER TABLE public.lotes OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 16618)
-- Name: lotes_id_lote_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lotes_id_lote_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lotes_id_lote_seq OWNER TO postgres;

--
-- TOC entry 5280 (class 0 OID 0)
-- Dependencies: 240
-- Name: lotes_id_lote_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lotes_id_lote_seq OWNED BY public.lotes.id_lote;


--
-- TOC entry 252 (class 1259 OID 16782)
-- Name: pagos_venta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagos_venta (
    id_pago_venta integer NOT NULL,
    id_venta integer NOT NULL,
    metodo_pago character varying(15) NOT NULL,
    monto_recibido numeric(12,2) NOT NULL,
    CONSTRAINT ck_pagos_venta_metodo CHECK (((metodo_pago)::text = ANY ((ARRAY['Transferencia'::character varying, 'transferencia'::character varying, 'Efectivo'::character varying, 'efectivo'::character varying, 'Tarjeta'::character varying, 'tarjeta'::character varying])::text[]))),
    CONSTRAINT ck_pagos_venta_monto CHECK ((monto_recibido > (0)::numeric))
);


ALTER TABLE public.pagos_venta OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 16781)
-- Name: pagos_venta_id_pago_venta_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagos_venta_id_pago_venta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagos_venta_id_pago_venta_seq OWNER TO postgres;

--
-- TOC entry 5281 (class 0 OID 0)
-- Dependencies: 251
-- Name: pagos_venta_id_pago_venta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagos_venta_id_pago_venta_seq OWNED BY public.pagos_venta.id_pago_venta;


--
-- TOC entry 224 (class 1259 OID 16397)
-- Name: permisos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permisos (
    id_permiso integer NOT NULL,
    nombre_permiso character varying(40) NOT NULL
);


ALTER TABLE public.permisos OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16396)
-- Name: permisos_id_permiso_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.permisos_id_permiso_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permisos_id_permiso_seq OWNER TO postgres;

--
-- TOC entry 5282 (class 0 OID 0)
-- Dependencies: 223
-- Name: permisos_id_permiso_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.permisos_id_permiso_seq OWNED BY public.permisos.id_permiso;


--
-- TOC entry 226 (class 1259 OID 16408)
-- Name: privilegios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.privilegios (
    id_privilegio integer NOT NULL,
    nombre_privilegio character varying(30) NOT NULL
);


ALTER TABLE public.privilegios OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16407)
-- Name: privilegios_id_privilegio_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.privilegios_id_privilegio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.privilegios_id_privilegio_seq OWNER TO postgres;

--
-- TOC entry 5283 (class 0 OID 0)
-- Dependencies: 225
-- Name: privilegios_id_privilegio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.privilegios_id_privilegio_seq OWNED BY public.privilegios.id_privilegio;


--
-- TOC entry 243 (class 1259 OID 16651)
-- Name: produccion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.produccion (
    id_produccion integer NOT NULL,
    id_usuario integer NOT NULL,
    id_lote integer NOT NULL,
    fecha_produccion timestamp without time zone DEFAULT now() NOT NULL,
    cantidad_procesada numeric(12,2) NOT NULL,
    merma numeric(12,2) DEFAULT 0 NOT NULL,
    observaciones character varying(200),
    unidad_medida character varying(12),
    CONSTRAINT ck_produccion_cantidad CHECK ((cantidad_procesada > (0)::numeric)),
    CONSTRAINT ck_produccion_merma CHECK (((merma >= (0)::numeric) AND (merma <= cantidad_procesada)))
);


ALTER TABLE public.produccion OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 16650)
-- Name: produccion_id_produccion_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.produccion_id_produccion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.produccion_id_produccion_seq OWNER TO postgres;

--
-- TOC entry 5284 (class 0 OID 0)
-- Dependencies: 242
-- Name: produccion_id_produccion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.produccion_id_produccion_seq OWNED BY public.produccion.id_produccion;


--
-- TOC entry 235 (class 1259 OID 16527)
-- Name: productos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.productos (
    id_producto integer NOT NULL,
    id_categoria integer NOT NULL,
    tipo_producto character varying(10) NOT NULL,
    presentacion character varying(40) NOT NULL,
    unidad_medida character varying(15) NOT NULL,
    precio_compra numeric(12,2) DEFAULT 0 NOT NULL,
    precio_venta_detal numeric(12,2) DEFAULT 0 NOT NULL,
    precio_venta_mayorista numeric(12,2) DEFAULT 0 NOT NULL,
    stock_inicial numeric(12,2) DEFAULT 0 NOT NULL,
    stock_disponible numeric(12,2) DEFAULT 0 NOT NULL,
    stock_minimo numeric(12,2) DEFAULT 0 NOT NULL,
    estado boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_productos_tipo CHECK (((tipo_producto)::text = ANY ((ARRAY['Fresca'::character varying, 'Congelada'::character varying, 'fresca'::character varying, 'congelada'::character varying])::text[]))),
    CONSTRAINT ck_productos_valores CHECK (((precio_compra >= (0)::numeric) AND (precio_venta_detal >= (0)::numeric) AND (precio_venta_mayorista >= (0)::numeric) AND (stock_inicial >= (0)::numeric) AND (stock_disponible >= (0)::numeric) AND (stock_minimo >= (0)::numeric)))
);


ALTER TABLE public.productos OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 16526)
-- Name: productos_id_producto_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.productos_id_producto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.productos_id_producto_seq OWNER TO postgres;

--
-- TOC entry 5285 (class 0 OID 0)
-- Dependencies: 234
-- Name: productos_id_producto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.productos_id_producto_seq OWNED BY public.productos.id_producto;


--
-- TOC entry 231 (class 1259 OID 16499)
-- Name: proveedores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proveedores (
    id_proveedor integer NOT NULL,
    nombre_proveedor character varying(50) NOT NULL,
    telefono character varying(15),
    correo character varying(30),
    direccion character varying(40),
    estado boolean DEFAULT true NOT NULL,
    municipio character varying(25),
    departamento character varying(30),
    CONSTRAINT ck_proveedores_correo CHECK (((correo IS NULL) OR ((correo)::text ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'::text)))
);


ALTER TABLE public.proveedores OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 16498)
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proveedores_id_proveedor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proveedores_id_proveedor_seq OWNER TO postgres;

--
-- TOC entry 5286 (class 0 OID 0)
-- Dependencies: 230
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proveedores_id_proveedor_seq OWNED BY public.proveedores.id_proveedor;


--
-- TOC entry 222 (class 1259 OID 16386)
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id_rol integer NOT NULL,
    nombre_rol character varying(30) NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16385)
-- Name: roles_id_rol_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roles_id_rol_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_rol_seq OWNER TO postgres;

--
-- TOC entry 5287 (class 0 OID 0)
-- Dependencies: 221
-- Name: roles_id_rol_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roles_id_rol_seq OWNED BY public.roles.id_rol;


--
-- TOC entry 227 (class 1259 OID 16418)
-- Name: roles_x_permisos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles_x_permisos (
    id_rol integer NOT NULL,
    id_permiso integer NOT NULL,
    id_privilegio integer NOT NULL
);


ALTER TABLE public.roles_x_permisos OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16442)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id_usuario integer NOT NULL,
    id_rol integer NOT NULL,
    nombre character varying(25) NOT NULL,
    apellido character varying(25) NOT NULL,
    correo character varying(40) NOT NULL,
    telefono character varying(15),
    contrasenia character varying(40) NOT NULL,
    estado boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_usuarios_correo CHECK ((((correo)::text = lower((correo)::text)) AND ((correo)::text ~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'::text)))
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 16441)
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_usuario_seq OWNER TO postgres;

--
-- TOC entry 5288 (class 0 OID 0)
-- Dependencies: 228
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_usuario_seq OWNED BY public.usuarios.id_usuario;


--
-- TOC entry 248 (class 1259 OID 16719)
-- Name: ventas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ventas (
    id_venta integer NOT NULL,
    numero_documento character varying(15) NOT NULL,
    id_usuario integer NOT NULL,
    tipo_venta character varying(10) NOT NULL,
    fecha_venta timestamp without time zone DEFAULT now() NOT NULL,
    iva numeric(12,2) DEFAULT 0 NOT NULL,
    descuento_total numeric(12,2) DEFAULT 0 NOT NULL,
    total_pagar numeric(12,2) DEFAULT 0 NOT NULL,
    estado boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_ventas_montos CHECK (((iva >= (0)::numeric) AND (descuento_total >= (0)::numeric) AND (total_pagar >= (0)::numeric))),
    CONSTRAINT ck_ventas_tipo CHECK (((tipo_venta)::text = ANY ((ARRAY['Mayorista'::character varying, 'mayorista'::character varying, 'Detal'::character varying, 'detal'::character varying])::text[])))
);


ALTER TABLE public.ventas OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 16718)
-- Name: ventas_id_venta_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ventas_id_venta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ventas_id_venta_seq OWNER TO postgres;

--
-- TOC entry 5289 (class 0 OID 0)
-- Dependencies: 247
-- Name: ventas_id_venta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ventas_id_venta_seq OWNED BY public.ventas.id_venta;


--
-- TOC entry 4943 (class 2604 OID 16519)
-- Name: categorias id_categoria; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias ALTER COLUMN id_categoria SET DEFAULT nextval('public.categorias_id_categoria_seq'::regclass);


--
-- TOC entry 4952 (class 2604 OID 16566)
-- Name: compras id_compra; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compras ALTER COLUMN id_compra SET DEFAULT nextval('public.compras_id_compra_seq'::regclass);


--
-- TOC entry 4958 (class 2604 OID 16597)
-- Name: detalle_compra id_detalle_compra; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_compra ALTER COLUMN id_detalle_compra SET DEFAULT nextval('public.detalle_compra_id_detalle_compra_seq'::regclass);


--
-- TOC entry 4967 (class 2604 OID 16681)
-- Name: detalle_produccion id_detalle_produccion; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_produccion ALTER COLUMN id_detalle_produccion SET DEFAULT nextval('public.detalle_produccion_id_detalle_produccion_seq'::regclass);


--
-- TOC entry 4975 (class 2604 OID 16755)
-- Name: detalle_venta id_detalle_venta; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_venta ALTER COLUMN id_detalle_venta SET DEFAULT nextval('public.detalle_venta_id_detalle_venta_seq'::regclass);


--
-- TOC entry 4959 (class 2604 OID 16622)
-- Name: lotes id_lote; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lotes ALTER COLUMN id_lote SET DEFAULT nextval('public.lotes_id_lote_seq'::regclass);


--
-- TOC entry 4976 (class 2604 OID 16785)
-- Name: pagos_venta id_pago_venta; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos_venta ALTER COLUMN id_pago_venta SET DEFAULT nextval('public.pagos_venta_id_pago_venta_seq'::regclass);


--
-- TOC entry 4937 (class 2604 OID 16400)
-- Name: permisos id_permiso; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permisos ALTER COLUMN id_permiso SET DEFAULT nextval('public.permisos_id_permiso_seq'::regclass);


--
-- TOC entry 4938 (class 2604 OID 16411)
-- Name: privilegios id_privilegio; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.privilegios ALTER COLUMN id_privilegio SET DEFAULT nextval('public.privilegios_id_privilegio_seq'::regclass);


--
-- TOC entry 4964 (class 2604 OID 16654)
-- Name: produccion id_produccion; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produccion ALTER COLUMN id_produccion SET DEFAULT nextval('public.produccion_id_produccion_seq'::regclass);


--
-- TOC entry 4944 (class 2604 OID 16530)
-- Name: productos id_producto; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos ALTER COLUMN id_producto SET DEFAULT nextval('public.productos_id_producto_seq'::regclass);


--
-- TOC entry 4941 (class 2604 OID 16502)
-- Name: proveedores id_proveedor; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id_proveedor SET DEFAULT nextval('public.proveedores_id_proveedor_seq'::regclass);


--
-- TOC entry 4936 (class 2604 OID 16389)
-- Name: roles id_rol; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles ALTER COLUMN id_rol SET DEFAULT nextval('public.roles_id_rol_seq'::regclass);


--
-- TOC entry 4939 (class 2604 OID 16445)
-- Name: usuarios id_usuario; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuarios_id_usuario_seq'::regclass);


--
-- TOC entry 4969 (class 2604 OID 16722)
-- Name: ventas id_venta; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ventas ALTER COLUMN id_venta SET DEFAULT nextval('public.ventas_id_venta_seq'::regclass);


--
-- TOC entry 5250 (class 0 OID 16516)
-- Dependencies: 233
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categorias (id_categoria, nombre_categoria) FROM stdin;
1	Calibre 1
2	Calibre 2
3	Calibre 3
4	Jumbo
\.


--
-- TOC entry 5263 (class 0 OID 16701)
-- Dependencies: 246
-- Data for Name: clientes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clientes (numero_documento, tipo_documento, nombre_cliente, telefono, correo, direccion, estado, departamento, municipio) FROM stdin;
1017123456	CC	Juan Pérez	3101234567	juan@mail.com	Calle 10 # 20-30	t	Antioquia	Medellín
900123456	NIT	Frutería La Cosecha SAS	6044445566	compras@cosecha.com	Carrera 50 # 40-10	t	Antioquia	Medellín
43567890	CC	María Torres	3157654321	maria@mail.com	Calle 30 # 45-12	t	Antioquia	Medellín
1020456789	CC	Andrés Mejía	3209876543	andres@mail.com	Transversal 78 # 65-20	t	Antioquia	Medellín
901234567	NIT	Restaurante El Fresal	6047778899	info@elfresal.com	Circular 4 # 70-15	t	Antioquia	Medellín
\.


--
-- TOC entry 5254 (class 0 OID 16563)
-- Dependencies: 237
-- Data for Name: compras; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.compras (id_compra, id_proveedor, id_usuario, fecha_compra, iva, descuento, total_compra, observaciones, estado) FROM stdin;
1	2	1	2026-10-08 08:00:00	0.00	0.00	250000.00	Compra de fresa	t
2	3	1	2026-10-09 08:00:00	0.00	0.00	180000.00	Compra de fresa	t
3	1	1	2026-10-11 08:00:00	0.00	0.00	300000.00	Compra de fresa	t
4	2	1	2026-10-12 08:00:00	0.00	0.00	220000.00	Compra de fresa	t
5	3	1	2026-10-14 08:00:00	0.00	0.00	150000.00	Compra de fresa	t
6	1	1	2026-10-16 08:00:00	0.00	0.00	260000.00	Compra de fresa	t
7	2	1	2026-10-17 08:00:00	0.00	0.00	210000.00	Compra de fresa	t
8	3	1	2026-10-19 08:00:00	0.00	0.00	190000.00	Compra de fresa	t
9	1	1	2026-10-20 08:00:00	0.00	0.00	240000.00	Compra de fresa	t
10	2	1	2026-10-22 08:00:00	0.00	0.00	200000.00	Compra de fresa	t
11	3	1	2026-10-23 08:00:00	0.00	0.00	230000.00	Compra de fresa	t
12	1	1	2026-10-24 08:00:00	0.00	0.00	170000.00	Compra de fresa	t
13	2	1	2026-10-25 08:00:00	0.00	0.00	280000.00	Compra de fresa	t
14	3	1	2026-10-26 08:00:00	0.00	0.00	160000.00	Compra de fresa	t
15	1	1	2026-10-27 08:00:00	0.00	0.00	210000.00	Compra de fresa	t
16	2	1	2026-10-28 08:00:00	0.00	0.00	190000.00	Compra de fresa	t
17	3	1	2026-10-30 08:00:00	0.00	0.00	260000.00	Compra de fresa	t
18	1	1	2026-10-31 08:00:00	0.00	0.00	1100000.00	Compra de fresa	t
19	2	1	2026-11-01 08:00:00	0.00	0.00	800000.00	Compra de fresa	t
20	3	1	2026-11-02 08:00:00	0.00	0.00	300000.00	Compra de fresa	t
21	1	1	2026-11-03 08:00:00	0.00	0.00	780000.00	Compra de fresa	t
22	2	1	2026-11-04 08:00:00	0.00	0.00	420000.00	Compra de fresa	t
23	3	1	2026-11-05 08:00:00	0.00	0.00	960000.00	Compra de fresa	t
24	1	1	2026-11-06 08:00:00	0.00	0.00	580000.00	Compra de fresa	t
\.


--
-- TOC entry 5256 (class 0 OID 16594)
-- Dependencies: 239
-- Data for Name: detalle_compra; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detalle_compra (id_detalle_compra, id_compra, id_producto, cantidad, unidad_medida, precio_unitario) FROM stdin;
1	1	1	35.71	kg	7000.00
2	2	2	27.69	kg	6500.00
3	3	3	50.00	kg	6000.00
4	4	4	27.50	kg	8000.00
5	5	5	15.79	kg	9500.00
6	6	6	28.89	kg	9000.00
7	7	7	24.71	kg	8500.00
8	8	8	18.10	kg	10500.00
9	9	1	34.29	kg	7000.00
10	10	2	30.77	kg	6500.00
11	11	3	38.33	kg	6000.00
12	12	4	21.25	kg	8000.00
13	13	5	29.47	kg	9500.00
14	14	6	17.78	kg	9000.00
15	15	7	24.71	kg	8500.00
16	16	8	18.10	kg	10500.00
17	17	1	37.14	kg	7000.00
18	18	2	169.23	kg	6500.00
19	19	3	133.33	kg	6000.00
20	20	4	37.50	kg	8000.00
21	21	5	82.11	kg	9500.00
22	22	6	46.67	kg	9000.00
23	23	7	112.94	kg	8500.00
24	24	8	55.24	kg	10500.00
\.


--
-- TOC entry 5262 (class 0 OID 16678)
-- Dependencies: 245
-- Data for Name: detalle_produccion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detalle_produccion (id_detalle_produccion, id_produccion, id_producto, cantidad_obtenida, unidad_medida) FROM stdin;
1	1	5	60.00	kg
2	2	6	95.00	kg
3	3	7	86.00	kg
4	4	8	83.00	kg
5	5	5	85.00	kg
6	6	6	84.00	kg
7	7	7	87.00	kg
8	8	8	82.00	kg
9	9	5	85.00	kg
10	10	6	86.00	kg
11	11	7	84.00	kg
12	12	8	83.00	kg
\.


--
-- TOC entry 5267 (class 0 OID 16752)
-- Dependencies: 250
-- Data for Name: detalle_venta; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detalle_venta (id_detalle_venta, id_venta, id_producto, id_lote, cantidad, unidad_medida, precio_unitario) FROM stdin;
1	1	1	3	114.29	kg	10500.00
2	2	2	4	63.64	kg	11000.00
3	3	3	5	176.47	kg	8500.00
4	4	5	6	50.00	kg	15000.00
5	5	6	7	38.33	kg	12000.00
6	6	7	8	23.08	kg	13000.00
7	7	1	3	76.19	kg	10500.00
8	8	2	4	40.91	kg	11000.00
9	9	3	5	70.59	kg	8500.00
10	10	5	6	25.33	kg	15000.00
11	11	6	7	83.33	kg	12000.00
12	12	7	8	52.42	kg	13000.00
13	13	1	3	104.76	kg	10500.00
14	14	2	4	71.82	kg	11000.00
\.


--
-- TOC entry 5258 (class 0 OID 16619)
-- Dependencies: 241
-- Data for Name: lotes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.lotes (id_lote, id_detalle_compra, numero_lote, fecha_ingreso, fecha_vencimiento, tipo_empaque, cantidad_disponible, zona_ubicacion, es_transformable, estado) FROM stdin;
1	11	L-001	2026-10-23	2026-10-30	Caja	0.00	Cámara fría	t	f
2	12	L-002	2026-10-24	2026-10-31	Bolsa	0.00	Cámara fría	t	f
3	17	L-003	2026-10-30	2026-11-06	Bulto	34.00	Cámara fría	t	t
4	18	L-004	2026-10-31	2026-11-07	Bulto	160.00	Cámara fría	t	t
5	19	L-005	2026-11-01	2026-11-07	Bulto	125.00	Cámara fría	t	t
6	21	L-006	2026-11-03	2027-05-05	Bolsa	70.00	Cámara congelada	f	t
7	22	L-007	2026-11-04	2027-05-05	Bolsa	32.00	Cámara congelada	f	t
8	23	L-008	2026-11-05	2027-05-05	Bolsa	100.00	Cámara congelada	f	t
\.


--
-- TOC entry 5269 (class 0 OID 16782)
-- Dependencies: 252
-- Data for Name: pagos_venta; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagos_venta (id_pago_venta, id_venta, metodo_pago, monto_recibido) FROM stdin;
3	2	transferencia	700000.00
\.


--
-- TOC entry 5241 (class 0 OID 16397)
-- Dependencies: 224
-- Data for Name: permisos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permisos (id_permiso, nombre_permiso) FROM stdin;
1	Ventas
2	Compras
3	Produccion
4	Inventario
\.


--
-- TOC entry 5243 (class 0 OID 16408)
-- Dependencies: 226
-- Data for Name: privilegios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.privilegios (id_privilegio, nombre_privilegio) FROM stdin;
1	Crear
2	Leer
3	Actualizar
4	Eliminar
\.


--
-- TOC entry 5260 (class 0 OID 16651)
-- Dependencies: 243
-- Data for Name: produccion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.produccion (id_produccion, id_usuario, id_lote, fecha_produccion, cantidad_procesada, merma, observaciones, unidad_medida) FROM stdin;
1	3	1	2026-10-25 14:00:00	100.00	40.00	Congelado	{kg}
2	3	2	2026-10-26 14:00:00	100.00	5.00	Congelado	{kg}
3	3	2	2026-10-29 14:00:00	100.00	14.00	Congelado	{kg}
4	3	2	2026-10-30 14:00:00	100.00	17.00	Congelado	{kg}
5	3	3	2026-10-31 14:00:00	100.00	15.00	Congelado	{kg}
6	3	4	2026-11-01 14:00:00	100.00	16.00	Congelado	{kg}
7	3	4	2026-11-02 14:00:00	100.00	13.00	Congelado	{kg}
8	3	5	2026-11-03 14:00:00	100.00	18.00	Congelado	{kg}
9	3	4	2026-11-04 14:00:00	100.00	15.00	Congelado	{kg}
10	3	5	2026-11-05 14:00:00	100.00	14.00	Congelado	{kg}
11	3	4	2026-11-06 14:00:00	100.00	16.00	Congelado	{kg}
12	3	5	2026-11-07 07:00:00	100.00	17.00	Congelado	{kg}
\.


--
-- TOC entry 5252 (class 0 OID 16527)
-- Dependencies: 235
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.productos (id_producto, id_categoria, tipo_producto, presentacion, unidad_medida, precio_compra, precio_venta_detal, precio_venta_mayorista, stock_inicial, stock_disponible, stock_minimo, estado) FROM stdin;
1	1	Fresca	Canastilla 5 kg	kg	7000.00	12000.00	10500.00	100.00	50.00	10.00	t
2	2	Fresca	Canastilla 5 kg	kg	6500.00	11000.00	9500.00	90.00	40.00	10.00	t
3	3	Fresca	Canastilla 5 kg	kg	6000.00	10000.00	8500.00	75.00	25.00	10.00	t
4	4	Fresca	Canastilla 5 kg	kg	8000.00	14000.00	12000.00	77.00	27.00	10.00	t
5	1	Congelada	Bolsa 1 kg	kg	9500.00	15000.00	13000.00	78.00	28.00	10.00	t
6	2	Congelada	Bolsa 1 kg	kg	9000.00	14000.00	12000.00	72.00	22.00	10.00	t
7	3	Congelada	Bolsa 1 kg	kg	8500.00	13000.00	11500.00	66.00	16.00	10.00	t
8	4	Congelada	Bolsa 1 kg	kg	10500.00	17000.00	15000.00	71.00	21.00	10.00	t
\.


--
-- TOC entry 5248 (class 0 OID 16499)
-- Dependencies: 231
-- Data for Name: proveedores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.proveedores (id_proveedor, nombre_proveedor, telefono, correo, direccion, estado, municipio, departamento) FROM stdin;
1	Fresas del Oriente	3111111111	oriente@mail.co	Vereda La Cruz	t	{Marinilla}	{Antioquia}
2	Agro San Vicente	3122222222	sanvic@mail.co	Finca El Mirador	t	{San Vicente}	{Antioquia}
3	Cultivos La Ceja	3133333333	laceja@mail.co	Km 5 Vía La Ceja	t	{La Ceja}	{Antioquia}
\.


--
-- TOC entry 5239 (class 0 OID 16386)
-- Dependencies: 222
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id_rol, nombre_rol) FROM stdin;
1	Administrador
2	Vendedor
3	Operario
\.


--
-- TOC entry 5244 (class 0 OID 16418)
-- Dependencies: 227
-- Data for Name: roles_x_permisos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles_x_permisos (id_rol, id_permiso, id_privilegio) FROM stdin;
\.


--
-- TOC entry 5246 (class 0 OID 16442)
-- Dependencies: 229
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (id_usuario, id_rol, nombre, apellido, correo, telefono, contrasenia, estado) FROM stdin;
1	1	Laura	Gómez	admin@fresas.co	3001112233	hash_demo	t
2	2	Carlos	Ríos	ventas@fresas.co	3002223344	hash_demo	t
3	3	Marta	Londoño	operario@fresas.co	3003334455	hash_demo	t
\.


--
-- TOC entry 5265 (class 0 OID 16719)
-- Dependencies: 248
-- Data for Name: ventas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ventas (id_venta, numero_documento, id_usuario, tipo_venta, fecha_venta, iva, descuento_total, total_pagar, estado) FROM stdin;
1	900123456	2	Mayorista	2026-10-31 09:00:00	0.00	0.00	1200000.00	t
2	43567890	2	Detal	2026-10-31 15:30:00	0.00	0.00	700000.00	t
3	1020456789	2	Mayorista	2026-11-01 09:30:00	0.00	0.00	1500000.00	t
4	901234567	2	Detal	2026-11-01 14:00:00	0.00	0.00	750000.00	t
5	1017123456	2	Mayorista	2026-11-02 10:00:00	0.00	0.00	460000.00	t
6	900123456	2	Detal	2026-11-02 12:30:00	0.00	0.00	300000.00	t
7	43567890	2	Mayorista	2026-11-03 09:15:00	0.00	0.00	800000.00	t
8	1020456789	2	Detal	2026-11-03 16:00:00	0.00	0.00	450000.00	t
9	901234567	2	Mayorista	2026-11-04 10:30:00	0.00	0.00	600000.00	t
10	1017123456	2	Detal	2026-11-04 13:45:00	0.00	0.00	380000.00	t
11	900123456	2	Mayorista	2026-11-05 09:00:00	0.00	0.00	1000000.00	t
12	43567890	2	Detal	2026-11-05 15:00:00	0.00	0.00	681500.00	t
13	1020456789	2	Mayorista	2026-11-06 08:30:00	0.00	0.00	1100000.00	t
14	901234567	2	Detal	2026-11-06 10:15:00	0.00	0.00	790000.00	t
\.


--
-- TOC entry 5290 (class 0 OID 0)
-- Dependencies: 232
-- Name: categorias_id_categoria_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categorias_id_categoria_seq', 4, true);


--
-- TOC entry 5291 (class 0 OID 0)
-- Dependencies: 236
-- Name: compras_id_compra_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.compras_id_compra_seq', 24, true);


--
-- TOC entry 5292 (class 0 OID 0)
-- Dependencies: 238
-- Name: detalle_compra_id_detalle_compra_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detalle_compra_id_detalle_compra_seq', 24, true);


--
-- TOC entry 5293 (class 0 OID 0)
-- Dependencies: 244
-- Name: detalle_produccion_id_detalle_produccion_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detalle_produccion_id_detalle_produccion_seq', 12, true);


--
-- TOC entry 5294 (class 0 OID 0)
-- Dependencies: 249
-- Name: detalle_venta_id_detalle_venta_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.detalle_venta_id_detalle_venta_seq', 14, true);


--
-- TOC entry 5295 (class 0 OID 0)
-- Dependencies: 240
-- Name: lotes_id_lote_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.lotes_id_lote_seq', 8, true);


--
-- TOC entry 5296 (class 0 OID 0)
-- Dependencies: 251
-- Name: pagos_venta_id_pago_venta_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagos_venta_id_pago_venta_seq', 5, true);


--
-- TOC entry 5297 (class 0 OID 0)
-- Dependencies: 223
-- Name: permisos_id_permiso_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.permisos_id_permiso_seq', 4, true);


--
-- TOC entry 5298 (class 0 OID 0)
-- Dependencies: 225
-- Name: privilegios_id_privilegio_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.privilegios_id_privilegio_seq', 4, true);


--
-- TOC entry 5299 (class 0 OID 0)
-- Dependencies: 242
-- Name: produccion_id_produccion_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.produccion_id_produccion_seq', 12, true);


--
-- TOC entry 5300 (class 0 OID 0)
-- Dependencies: 234
-- Name: productos_id_producto_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.productos_id_producto_seq', 8, true);


--
-- TOC entry 5301 (class 0 OID 0)
-- Dependencies: 230
-- Name: proveedores_id_proveedor_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.proveedores_id_proveedor_seq', 3, true);


--
-- TOC entry 5302 (class 0 OID 0)
-- Dependencies: 221
-- Name: roles_id_rol_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_rol_seq', 3, true);


--
-- TOC entry 5303 (class 0 OID 0)
-- Dependencies: 228
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_id_usuario_seq', 3, true);


--
-- TOC entry 5304 (class 0 OID 0)
-- Dependencies: 247
-- Name: ventas_id_venta_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ventas_id_venta_seq', 14, true);


--
-- TOC entry 5022 (class 2606 OID 16523)
-- Name: categorias pk_categorias; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT pk_categorias PRIMARY KEY (id_categoria);


--
-- TOC entry 5056 (class 2606 OID 16712)
-- Name: clientes pk_clientes; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT pk_clientes PRIMARY KEY (numero_documento);


--
-- TOC entry 5034 (class 2606 OID 16582)
-- Name: compras pk_compras; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT pk_compras PRIMARY KEY (id_compra);


--
-- TOC entry 5038 (class 2606 OID 16607)
-- Name: detalle_compra pk_detalle_compra; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_compra
    ADD CONSTRAINT pk_detalle_compra PRIMARY KEY (id_detalle_compra);


--
-- TOC entry 5052 (class 2606 OID 16688)
-- Name: detalle_produccion pk_detalle_produccion; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_produccion
    ADD CONSTRAINT pk_detalle_produccion PRIMARY KEY (id_detalle_produccion);


--
-- TOC entry 5066 (class 2606 OID 16765)
-- Name: detalle_venta pk_detalle_venta; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_venta
    ADD CONSTRAINT pk_detalle_venta PRIMARY KEY (id_detalle_venta);


--
-- TOC entry 5041 (class 2606 OID 16640)
-- Name: lotes pk_lotes; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT pk_lotes PRIMARY KEY (id_lote);


--
-- TOC entry 5068 (class 2606 OID 16793)
-- Name: pagos_venta pk_pagos_venta; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos_venta
    ADD CONSTRAINT pk_pagos_venta PRIMARY KEY (id_pago_venta);


--
-- TOC entry 5003 (class 2606 OID 16404)
-- Name: permisos pk_permisos; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT pk_permisos PRIMARY KEY (id_permiso);


--
-- TOC entry 5007 (class 2606 OID 16415)
-- Name: privilegios pk_privilegios; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.privilegios
    ADD CONSTRAINT pk_privilegios PRIMARY KEY (id_privilegio);


--
-- TOC entry 5049 (class 2606 OID 16666)
-- Name: produccion pk_produccion; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produccion
    ADD CONSTRAINT pk_produccion PRIMARY KEY (id_produccion);


--
-- TOC entry 5027 (class 2606 OID 16554)
-- Name: productos pk_productos; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT pk_productos PRIMARY KEY (id_producto);


--
-- TOC entry 5020 (class 2606 OID 16509)
-- Name: proveedores pk_proveedores; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT pk_proveedores PRIMARY KEY (id_proveedor);


--
-- TOC entry 4999 (class 2606 OID 16393)
-- Name: roles pk_roles; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT pk_roles PRIMARY KEY (id_rol);


--
-- TOC entry 5013 (class 2606 OID 16425)
-- Name: roles_x_permisos pk_roles_x_permisos; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles_x_permisos
    ADD CONSTRAINT pk_roles_x_permisos PRIMARY KEY (id_rol, id_permiso, id_privilegio);


--
-- TOC entry 5016 (class 2606 OID 16456)
-- Name: usuarios pk_usuarios; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT pk_usuarios PRIMARY KEY (id_usuario);


--
-- TOC entry 5061 (class 2606 OID 16740)
-- Name: ventas pk_ventas; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT pk_ventas PRIMARY KEY (id_venta);


--
-- TOC entry 5024 (class 2606 OID 16525)
-- Name: categorias uq_categorias_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT uq_categorias_nombre UNIQUE (nombre_categoria);


--
-- TOC entry 5054 (class 2606 OID 16690)
-- Name: detalle_produccion uq_detalle_produccion_producto; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_produccion
    ADD CONSTRAINT uq_detalle_produccion_producto UNIQUE (id_produccion, id_producto);


--
-- TOC entry 5043 (class 2606 OID 16642)
-- Name: lotes uq_lotes_linea_compra; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT uq_lotes_linea_compra UNIQUE (id_detalle_compra);


--
-- TOC entry 5045 (class 2606 OID 16644)
-- Name: lotes uq_lotes_numero; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT uq_lotes_numero UNIQUE (numero_lote);


--
-- TOC entry 5070 (class 2606 OID 16795)
-- Name: pagos_venta uq_pagos_venta_metodo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos_venta
    ADD CONSTRAINT uq_pagos_venta_metodo UNIQUE (id_venta, metodo_pago);


--
-- TOC entry 5005 (class 2606 OID 16406)
-- Name: permisos uq_permisos_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permisos
    ADD CONSTRAINT uq_permisos_nombre UNIQUE (nombre_permiso);


--
-- TOC entry 5009 (class 2606 OID 16417)
-- Name: privilegios uq_privilegios_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.privilegios
    ADD CONSTRAINT uq_privilegios_nombre UNIQUE (nombre_privilegio);


--
-- TOC entry 5029 (class 2606 OID 16556)
-- Name: productos uq_productos_variante; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT uq_productos_variante UNIQUE (id_categoria, tipo_producto, presentacion);


--
-- TOC entry 5001 (class 2606 OID 16858)
-- Name: roles uq_roles_nombre; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT uq_roles_nombre UNIQUE (nombre_rol);


--
-- TOC entry 5018 (class 2606 OID 16834)
-- Name: usuarios uq_usuarios_correo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT uq_usuarios_correo UNIQUE (correo);


--
-- TOC entry 5030 (class 1259 OID 16807)
-- Name: idx_compras_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compras_fecha ON public.compras USING btree (fecha_compra);


--
-- TOC entry 5031 (class 1259 OID 16805)
-- Name: idx_compras_proveedor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compras_proveedor ON public.compras USING btree (id_proveedor);


--
-- TOC entry 5032 (class 1259 OID 16806)
-- Name: idx_compras_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_compras_usuario ON public.compras USING btree (id_usuario);


--
-- TOC entry 5035 (class 1259 OID 16808)
-- Name: idx_detalle_compra_compra; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_compra_compra ON public.detalle_compra USING btree (id_compra);


--
-- TOC entry 5036 (class 1259 OID 16809)
-- Name: idx_detalle_compra_producto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_compra_producto ON public.detalle_compra USING btree (id_producto);


--
-- TOC entry 5050 (class 1259 OID 16813)
-- Name: idx_detalle_produccion_producto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_produccion_producto ON public.detalle_produccion USING btree (id_producto);


--
-- TOC entry 5062 (class 1259 OID 16819)
-- Name: idx_detalle_venta_lote; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_venta_lote ON public.detalle_venta USING btree (id_lote);


--
-- TOC entry 5063 (class 1259 OID 16818)
-- Name: idx_detalle_venta_producto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_venta_producto ON public.detalle_venta USING btree (id_producto);


--
-- TOC entry 5064 (class 1259 OID 16817)
-- Name: idx_detalle_venta_venta; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_detalle_venta_venta ON public.detalle_venta USING btree (id_venta);


--
-- TOC entry 5039 (class 1259 OID 16810)
-- Name: idx_lotes_vencimiento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lotes_vencimiento ON public.lotes USING btree (fecha_vencimiento);


--
-- TOC entry 5046 (class 1259 OID 16812)
-- Name: idx_produccion_lote; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_produccion_lote ON public.produccion USING btree (id_lote);


--
-- TOC entry 5047 (class 1259 OID 16811)
-- Name: idx_produccion_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_produccion_usuario ON public.produccion USING btree (id_usuario);


--
-- TOC entry 5025 (class 1259 OID 16804)
-- Name: idx_productos_categoria; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_productos_categoria ON public.productos USING btree (id_categoria);


--
-- TOC entry 5010 (class 1259 OID 16801)
-- Name: idx_rxp_permiso; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rxp_permiso ON public.roles_x_permisos USING btree (id_permiso);


--
-- TOC entry 5011 (class 1259 OID 16802)
-- Name: idx_rxp_privilegio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rxp_privilegio ON public.roles_x_permisos USING btree (id_privilegio);


--
-- TOC entry 5014 (class 1259 OID 16803)
-- Name: idx_usuarios_rol; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_usuarios_rol ON public.usuarios USING btree (id_rol);


--
-- TOC entry 5057 (class 1259 OID 16814)
-- Name: idx_ventas_cliente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ventas_cliente ON public.ventas USING btree (numero_documento);


--
-- TOC entry 5058 (class 1259 OID 16816)
-- Name: idx_ventas_fecha; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ventas_fecha ON public.ventas USING btree (fecha_venta);


--
-- TOC entry 5059 (class 1259 OID 16815)
-- Name: idx_ventas_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ventas_usuario ON public.ventas USING btree (id_usuario);


--
-- TOC entry 5076 (class 2606 OID 16583)
-- Name: compras fk_compras_proveedores; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT fk_compras_proveedores FOREIGN KEY (id_proveedor) REFERENCES public.proveedores(id_proveedor);


--
-- TOC entry 5077 (class 2606 OID 16588)
-- Name: compras fk_compras_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compras
    ADD CONSTRAINT fk_compras_usuarios FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario);


--
-- TOC entry 5078 (class 2606 OID 16608)
-- Name: detalle_compra fk_detalle_compra_compras; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_compra
    ADD CONSTRAINT fk_detalle_compra_compras FOREIGN KEY (id_compra) REFERENCES public.compras(id_compra);


--
-- TOC entry 5079 (class 2606 OID 16613)
-- Name: detalle_compra fk_detalle_compra_productos; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_compra
    ADD CONSTRAINT fk_detalle_compra_productos FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- TOC entry 5083 (class 2606 OID 16691)
-- Name: detalle_produccion fk_detalle_produccion_produccion; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_produccion
    ADD CONSTRAINT fk_detalle_produccion_produccion FOREIGN KEY (id_produccion) REFERENCES public.produccion(id_produccion);


--
-- TOC entry 5084 (class 2606 OID 16696)
-- Name: detalle_produccion fk_detalle_produccion_productos; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_produccion
    ADD CONSTRAINT fk_detalle_produccion_productos FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- TOC entry 5087 (class 2606 OID 16776)
-- Name: detalle_venta fk_detalle_venta_lotes; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_venta
    ADD CONSTRAINT fk_detalle_venta_lotes FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote);


--
-- TOC entry 5088 (class 2606 OID 16771)
-- Name: detalle_venta fk_detalle_venta_productos; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_venta
    ADD CONSTRAINT fk_detalle_venta_productos FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- TOC entry 5089 (class 2606 OID 16766)
-- Name: detalle_venta fk_detalle_venta_ventas; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detalle_venta
    ADD CONSTRAINT fk_detalle_venta_ventas FOREIGN KEY (id_venta) REFERENCES public.ventas(id_venta);


--
-- TOC entry 5080 (class 2606 OID 16645)
-- Name: lotes fk_lotes_detalle_compra; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT fk_lotes_detalle_compra FOREIGN KEY (id_detalle_compra) REFERENCES public.detalle_compra(id_detalle_compra);


--
-- TOC entry 5090 (class 2606 OID 16796)
-- Name: pagos_venta fk_pagos_venta_ventas; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos_venta
    ADD CONSTRAINT fk_pagos_venta_ventas FOREIGN KEY (id_venta) REFERENCES public.ventas(id_venta);


--
-- TOC entry 5081 (class 2606 OID 16672)
-- Name: produccion fk_produccion_lotes; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produccion
    ADD CONSTRAINT fk_produccion_lotes FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote);


--
-- TOC entry 5082 (class 2606 OID 16667)
-- Name: produccion fk_produccion_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.produccion
    ADD CONSTRAINT fk_produccion_usuarios FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario);


--
-- TOC entry 5075 (class 2606 OID 16557)
-- Name: productos fk_productos_categorias; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_productos_categorias FOREIGN KEY (id_categoria) REFERENCES public.categorias(id_categoria);


--
-- TOC entry 5071 (class 2606 OID 16431)
-- Name: roles_x_permisos fk_rxp_permisos; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles_x_permisos
    ADD CONSTRAINT fk_rxp_permisos FOREIGN KEY (id_permiso) REFERENCES public.permisos(id_permiso);


--
-- TOC entry 5072 (class 2606 OID 16436)
-- Name: roles_x_permisos fk_rxp_privilegios; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles_x_permisos
    ADD CONSTRAINT fk_rxp_privilegios FOREIGN KEY (id_privilegio) REFERENCES public.privilegios(id_privilegio);


--
-- TOC entry 5073 (class 2606 OID 16426)
-- Name: roles_x_permisos fk_rxp_roles; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles_x_permisos
    ADD CONSTRAINT fk_rxp_roles FOREIGN KEY (id_rol) REFERENCES public.roles(id_rol);


--
-- TOC entry 5074 (class 2606 OID 16459)
-- Name: usuarios fk_usuarios_roles; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT fk_usuarios_roles FOREIGN KEY (id_rol) REFERENCES public.roles(id_rol);


--
-- TOC entry 5085 (class 2606 OID 16741)
-- Name: ventas fk_ventas_clientes; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT fk_ventas_clientes FOREIGN KEY (numero_documento) REFERENCES public.clientes(numero_documento) ON UPDATE CASCADE;


--
-- TOC entry 5086 (class 2606 OID 16746)
-- Name: ventas fk_ventas_usuarios; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT fk_ventas_usuarios FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario);


-- Completed on 2026-11-11 18:51:43

--
-- PostgreSQL database dump complete
--

\unrestrict Usq6lE8G5Pf8Bccbj6N3p3EbdfpiA5x6qbdypUpHcniR9nDOaWbLnQ4pQ3HC1Jn

