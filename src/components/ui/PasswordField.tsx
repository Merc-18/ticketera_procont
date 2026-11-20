import { useState, type InputHTMLAttributes } from 'react'
import Icon from './Icon'

/** Solo presentación: conserva valor, eventos, límites y validación del input original. */
export default function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return <div className="password-field">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" disabled={props.disabled} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}
      onClick={() => setVisible(v => !v)} className="password-toggle">
      <Icon name={visible ? 'eyeOff' : 'eye'} />
    </button>
  </div>
}
