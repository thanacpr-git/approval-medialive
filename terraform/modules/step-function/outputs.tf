output "state_machine_arn" {
  value = aws_sfn_state_machine.channel_turnoff.arn
}

output "state_machine_name" {
  value = aws_sfn_state_machine.channel_turnoff.name
}
