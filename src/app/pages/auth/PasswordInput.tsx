import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/cossui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/cossui/input-group";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

export function PasswordInput({
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  required,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
      />
      <InputGroupAddon align="inline-end">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
