import React, { useEffect, useRef, useId } from 'react';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    width,
    id,
    'aria-labelledby': ariaLabelledByProp,
    ...props
}) => {
    const generatedTitleId = useId();
    const titleId = title ? (id ? `${id}-title` : generatedTitleId) : undefined;
    const effectiveAriaLabelledBy = ariaLabelledByProp || titleId;
    const modalBoxRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        previousActiveElementRef.current = document.activeElement;

        const focusableSelector =
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const focusTimer = setTimeout(() => {
            if (modalBoxRef.current) {
                const focusables = Array.from(
                    modalBoxRef.current.querySelectorAll(focusableSelector)
                ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

                if (focusables.length > 0) {
                    focusables[0].focus();
                } else if (modalBoxRef.current) {
                    modalBoxRef.current.focus?.();
                }
            }
        }, 0);

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
                return;
            }

            if (e.key === 'Tab') {
                if (!modalBoxRef.current) return;

                const focusables = Array.from(
                    modalBoxRef.current.querySelectorAll(focusableSelector)
                ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

                if (focusables.length === 0) {
                    e.preventDefault();
                    return;
                }

                const firstElement = focusables[0];
                const lastElement = focusables[focusables.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstElement || !modalBoxRef.current.contains(document.activeElement)) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement || !modalBoxRef.current.contains(document.activeElement)) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';

            if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
                previousActiveElementRef.current.focus();
            }
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            id={id}
            className="modal modal-open z-[2000]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={effectiveAriaLabelledBy}
            {...props}
        >
            <div
                ref={modalBoxRef}
                tabIndex={-1}
                className="modal-box bg-base-100 border border-base-200 p-0 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
                style={{ width: width || '600px', maxWidth: '90vw' }}
            >
                <div className="flex items-center justify-between p-5 border-b border-base-200">
                    <h3 id={titleId} className="font-extrabold text-base text-base-content m-0">
                        {title}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-sm btn-ghost btn-circle"
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 text-xs">{children}</div>
                {footer && (
                    <div className="p-4 bg-base-200/50 border-t border-base-200 flex justify-end gap-2">
                        {footer}
                    </div>
                )}
            </div>
            <div className="modal-backdrop bg-black/50 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />
        </div>
    );
};

export default Modal;
