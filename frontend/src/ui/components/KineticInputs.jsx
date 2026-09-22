import React, { useState } from 'react';
import { TK } from '../../tokens/kineticHorizon';
import { countries } from '../../utils/countries';

export const WInput = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon,
  required,
  half,
  fullWidth = true,
  onBlur,
  trailing,
  suffix,
  unit,
  helper,
  helperText,
  error,
  disabled,
  multiline,
  rows = 3,
  minRows,
  inputProps = {},
  style = {},
  className = '',
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const displayHelper = helperText || helper;
  const isError = Boolean(error);
  const effectiveRows = minRows || rows;
  const errorColor = TK.danger || TK.error || '#ef4444';

  return (
    <div
      className={className}
      {...rest}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: half ? '1 1 calc(50% - 8px)' : (fullWidth ? '1 1 100%' : 'initial'),
        minWidth: half ? 140 : 'unset',
        width: fullWidth ? '100%' : 'auto',
        ...style
      }}
    >
      {(label || displayHelper) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          {label && (
            <label style={{ fontWeight: 700, fontSize: 12, color: isError ? errorColor : TK.text2, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
              {label}{required && <span style={{ color: errorColor, marginLeft: 3 }}>*</span>}
            </label>
          )}
          {displayHelper && (
            <span style={{ fontSize: 11, fontWeight: 500, color: isError ? errorColor : TK.text3, textAlign: 'right', flexShrink: 1, whiteSpace: 'nowrap' }}>
              {displayHelper}
            </span>
          )}
        </div>
      )}
      <div style={{
        display: 'flex',
        alignItems: multiline ? 'flex-start' : 'center',
        gap: 8,
        padding: multiline ? '10px 14px' : '9px 12px',
        borderRadius: 12,
        border: `1.5px solid ${isError ? errorColor : (focused ? TK.primary : TK.border)}`,
        background: disabled ? '#f8fafc' : '#ffffff',
        boxShadow: focused
          ? (isError ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(0,80,212,0.08)')
          : 'none',
        transition: 'all 0.15s ease-in-out',
      }}>
        {icon && (
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 18,
              color: isError ? errorColor : (focused ? TK.primary : TK.text3),
              flexShrink: 0,
              marginTop: multiline ? 2 : 0
            }}
          >
            {icon}
          </span>
        )}
        {multiline ? (
          <textarea
            rows={effectiveRows}
            placeholder={placeholder}
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              color: disabled ? TK.text3 : TK.text1,
              width: '100%',
              minWidth: 0,
              resize: 'vertical',
              ...inputProps?.style
            }}
            {...inputProps}
          />
        ) : (
          <input
            type={type}
            placeholder={placeholder}
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { setFocused(false); onBlur && onBlur(e); }}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              color: disabled ? TK.text3 : TK.text1,
              width: '100%',
              minWidth: 0,
              flex: 1,
              minHeight: 22,
              MozAppearance: type === 'number' ? 'textfield' : undefined,
              WebkitAppearance: type === 'number' ? 'none' : undefined,
              ...inputProps?.style
            }}
            {...inputProps}
          />
        )}
        {(unit || suffix) && (
          <span style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: TK.text2,
            background: '#f1f5f9',
            padding: '2px 7px',
            borderRadius: 6,
            flexShrink: 0
          }}>
            {unit || suffix}
          </span>
        )}
        {trailing}
      </div>
    </div>
  );
};

export const WPhoneInput = ({
  label,
  value,
  onChange,
  dialCode,
  onDialCodeChange,
  required,
  half,
  error,
  helper,
  helperText,
  style = {},
  className = '',
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const isError = Boolean(error);
  const displayHelper = helperText || helper;
  const errorColor = TK.danger || TK.error || '#ef4444';

  return (
    <div
      className={className}
      {...rest}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: half ? '1 1 calc(50% - 8px)' : '1 1 100%',
        minWidth: half ? 140 : 'unset',
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700, fontSize: 12, color: isError ? errorColor : TK.text2 }}>
          {label}{required && <span style={{ color: errorColor, marginLeft: 3 }}>*</span>}
        </label>
        {displayHelper && (
          <span style={{ fontSize: 11, fontWeight: 500, color: isError ? errorColor : TK.text3, textAlign: 'right', flexShrink: 1, whiteSpace: 'nowrap' }}>
            {displayHelper}
          </span>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', borderRadius: 12,
        border: `1.5px solid ${isError ? errorColor : (focused ? TK.primary : TK.border)}`,
        background: '#fff',
        boxShadow: focused
          ? (isError ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(0,80,212,0.08)')
          : 'none',
        transition: 'all 0.15s',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: isError ? errorColor : (focused ? TK.primary : TK.text3), flexShrink: 0 }}>phone</span>
        <select
          value={dialCode || '+965'}
          onChange={e => onDialCodeChange(e.target.value)}
          style={{
            border: 'none', background: '#f1f5f9', borderRadius: 6, padding: '4px 6px',
            fontSize: 12, fontWeight: 700, color: TK.primary, outline: 'none', cursor: 'pointer', maxWidth: 95
          }}
        >
          {countries.map(c => (
            <option key={c.code} value={c.dialCode}>
              {c.flag} {c.dialCode} ({c.code})
            </option>
          ))}
        </select>
        <input
          type="tel"
          placeholder="5000 0000"
          value={value ?? ''}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%', minHeight: 20 }}
        />
      </div>
    </div>
  );
};

export const WSelect = ({
  label,
  value,
  onChange,
  options,
  icon,
  half,
  required,
  helper,
  helperText,
  error,
  style = {},
  className = '',
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const isError = Boolean(error);
  const displayHelper = helperText || helper;
  const errorColor = TK.danger || TK.error || '#ef4444';

  return (
    <div
      className={className}
      {...rest}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: half ? '1 1 calc(50% - 8px)' : '1 1 100%',
        minWidth: half ? 140 : 'unset',
        ...style
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700, fontSize: 12, color: isError ? errorColor : TK.text2 }}>
          {label}{required && <span style={{ color: errorColor, marginLeft: 3 }}>*</span>}
        </label>
        {displayHelper && <span style={{ fontSize: 11, fontWeight: 500, color: isError ? errorColor : TK.text3, textAlign: 'right' }}>{displayHelper}</span>}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderRadius: 12,
        border: `1.5px solid ${isError ? errorColor : (focused ? TK.primary : TK.border)}`,
        background: '#fff',
        boxShadow: focused
          ? (isError ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(0,80,212,0.08)')
          : 'none',
        transition: 'all 0.15s',
      }}>
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 18, color: isError ? errorColor : (focused ? TK.primary : TK.text3), flexShrink: 0 }}>{icon}</span>}
        <select
          value={value ?? ''}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: value ? TK.text1 : TK.text3, width: '100%', cursor: 'pointer', appearance: 'none', minHeight: 20 }}
        >
          <option value="">Select…</option>
          {options.map(o => (typeof o === 'object' ? <option key={o.value || o.code || o.id} value={o.value || o.name || o.code || o.id}>{o.label || o.name || o.code || o.title}</option> : <option key={o} value={o}>{o}</option>))}
        </select>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.text3, flexShrink: 0 }}>expand_more</span>
      </div>
    </div>
  );
};

