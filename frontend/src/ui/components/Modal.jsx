import React, { useEffect } from 'react';

const Modal = ({ isOpen, onClose, title, children, footer, width }) => {
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal modal-open z-[2000]">
            <div 
                className="modal-box bg-base-100 border border-base-200 p-0 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
                style={{ width: width || '600px', maxWidth: '90vw' }}
            >
                <div className="flex items-center justify-between p-5 border-b border-base-200">
                    <h3 className="font-extrabold text-base text-base-content m-0">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-sm btn-ghost btn-circle"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 text-xs">
                    {children}
                </div>
                {footer && (
                    <div className="p-4 bg-base-200/50 border-t border-base-200 flex justify-end gap-2">
                        {footer}
                    </div>
                )}
            </div>
            <div className="modal-backdrop bg-black/50 backdrop-blur-xs" onClick={onClose} />
        </div>
    );
};

export default Modal;
